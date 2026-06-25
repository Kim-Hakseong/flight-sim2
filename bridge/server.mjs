// Bridge: HTTP receiver (browser sim) + UDP sender (QGroundControl).
//
// Browser POSTs telemetry JSON to /telemetry every ~50ms. We translate to
// MAVLink v1 messages and emit on UDP to QGC. We also emit a 1Hz HEARTBEAT
// independently so the link stays "alive" in QGC.
//
// As a convenience this same server also serves the static project root,
// so the user can run a single command and open http://localhost:8765/.
//
// QGC default behavior: it auto-connects to UDP 14550 listening for any
// incoming MAVLink. So just running this script and starting QGC is enough.

import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  encodeHeartbeat,
  encodeAttitude,
  encodeGlobalPosition,
  encodeVfrHud,
  encodeGpsRaw,
  encodeParamValue,
  encodeMissionCount,
  encodeCommandAck,
  encodeAutopilotVersion,
  encodeHomePosition,
  encodeMissionRequestInt,
  encodeMissionAck,
  encodeMissionCurrent,
  encodeMissionItemReached,
  decode,
  decodeMissionCount,
  decodeMissionItemInt,
  decodeCommandLong,
  decodeCommandInt,
  decodeParamRequestList,
  decodeParamRequestRead,
  decodeParamSet,
} from './mavlink.mjs';
import {
  listParams,
  paramCount,
  getParamByIndex,
  getParamEntry,
  setParam as storeParam,
  getOverrides,
} from '../src/params.js';

// MAV_MODE_FLAG bits (subset).
const MODE_CUSTOM   = 0x01;
const MODE_AUTO     = 0x04;
const MODE_GUIDED   = 0x08;
const MODE_STAB     = 0x10;
const MODE_MANUAL   = 0x40;
const MODE_ARMED    = 0x80;

// Default mode: manual + armed (so QGC shows armed/manual at boot).
let modeFlags = MODE_MANUAL | MODE_ARMED;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8765', 10);
const QGC_HOST = process.env.QGC_HOST || '127.0.0.1';
const QGC_PORT = parseInt(process.env.QGC_PORT || '14550', 10);
// Local UDP port we bind for sending and for receiving QGC's replies.
const BIND_PORT = parseInt(process.env.BIND_PORT || '14555', 10);

// Reference home position — used to map sim local coords to lat/lon.
// RKSI (Incheon) by default; override with HOME_LAT / HOME_LON env vars.
const HOME = {
  lat: parseFloat(process.env.HOME_LAT || '37.4602'),
  lon: parseFloat(process.env.HOME_LON || '126.4407'),
  alt: parseFloat(process.env.HOME_ALT || '7'),
};

const udp = createSocket('udp4');
const bootMs = Date.now();

function send(buf) {
  udp.send(buf, 0, buf.length, QGC_PORT, QGC_HOST, err => {
    if (err) console.error('[bridge] UDP send error:', err.message);
  });
}

// Bind locally so QGC's replies (params, commands, etc.) come back to us.
udp.on('listening', () => {
  const a = udp.address();
  console.log(`[bridge] UDP bound to ${a.address}:${a.port} (replies from QGC arrive here)`);
});
udp.on('error', err => console.error('[bridge] UDP error:', err.message));

udp.on('message', (msg /*, rinfo */) => {
  const packets = decode(msg);
  for (const p of packets) {
    if (p.version !== 1) continue;
    handleIncoming(p);
  }
});

udp.bind(BIND_PORT);

// 1 Hz HEARTBEAT keeps QGC's link timer happy.
function sendHeartbeat() {
  send(encodeHeartbeat({
    type: 1, autopilot: 0, // GENERIC autopilot (was INVALID before)
    baseMode: modeFlags,
    customMode: 0,
    systemStatus: 4,
  }));
}
setInterval(sendHeartbeat, 1000);
sendHeartbeat();

// ---------- SSE channel (bridge → browser) ----------

const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) {
    try { c.write(payload); } catch { /* client gone */ }
  }
}

// ---------- Mission upload state ----------

let pendingMission = null;        // { count, items, expectedSeq, gcsSys, gcsComp }
let activeMission = null;          // [items] after upload completes

// Latest GCS nav command (M3). One-shot SSE events get lost if the browser's
// EventSource drops/reconnects, so buffer the last command and re-send it on every
// SSE connect; the sim dedupes by __seq so it applies exactly once.
let lastNav = null;
let navSeq = 0;
function sendNav(event, data) {
  navSeq += 1;
  lastNav = { event, data: { ...data, __seq: navSeq } };
  broadcast(event, lastNav.data);
}

function handleMissionCount(p) {
  const c = decodeMissionCount(p.payload);
  if (c.count === 0) {
    // QGC clearing the mission.
    activeMission = [];
    pendingMission = null;
    send(encodeMissionAck({ targetSystem: p.sys, targetComponent: p.comp, type: 0 }));
    broadcast('mission', { items: [], home: HOME });
    console.log('[bridge] mission cleared by GCS');
    return;
  }
  pendingMission = {
    count: c.count, items: [], expectedSeq: 0,
    gcsSys: p.sys, gcsComp: p.comp,
  };
  send(encodeMissionRequestInt({
    targetSystem: p.sys, targetComponent: p.comp, seq: 0,
  }));
  console.log(`[bridge] mission upload starting: ${c.count} items`);
}

function handleMissionItem(p) {
  if (!pendingMission) return;
  const item = decodeMissionItemInt(p.payload);
  if (item.seq !== pendingMission.expectedSeq) return; // out of order — ignore
  pendingMission.items.push(item);
  pendingMission.expectedSeq++;
  if (pendingMission.expectedSeq < pendingMission.count) {
    send(encodeMissionRequestInt({
      targetSystem: pendingMission.gcsSys, targetComponent: pendingMission.gcsComp,
      seq: pendingMission.expectedSeq,
    }));
  } else {
    send(encodeMissionAck({
      targetSystem: pendingMission.gcsSys, targetComponent: pendingMission.gcsComp,
      type: 0,
    }));
    activeMission = pendingMission.items;
    pendingMission = null;
    broadcast('mission', { items: activeMission, home: HOME });
    console.log(`[bridge] mission uploaded: ${activeMission.length} items`);
  }
}

// ---------- HTTP: telemetry receiver + static file server ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.md':   'text/markdown; charset=utf-8',
};

async function serveStatic(req, res, urlPath) {
  const p = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = normalize(join(ROOT, p));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) { res.writeHead(404); res.end(); return; }
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
}

let lastTelemetryAt = 0;
let telemetryCount = 0;
let lastMissionSeqReported = -1;

const server = createServer((req, res) => {
  // Permissive CORS so a file:// page can also POST here.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // SSE: stream commands (mission, mode, etc.) from bridge to browser.
  if (req.method === 'GET' && req.url === '/commands') {
    // Disable Nagle: SSE events are tiny, and Nagle can hold a small write in the
    // kernel for ~40ms waiting to coalesce — long enough that a client (notably a
    // headless-Chrome EventSource) appears connected but never receives anything
    // (the "zombie EventSource"). setNoDelay flushes each event immediately.
    if (res.socket) res.socket.setNoDelay(true);
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'access-control-allow-origin': '*',
    });
    if (res.flushHeaders) res.flushHeaders();
    res.write(': connected\n\n');
    sseClients.add(res);
    // If a mission was already received before the browser connected, send it now.
    if (activeMission) {
      const payload = `event: mission\ndata: ${JSON.stringify({ items: activeMission, home: HOME })}\n\n`;
      try { res.write(payload); } catch {}
    }
    // Re-send the latest nav command so a (re)connecting sim catches one it may have
    // missed; the sim dedupes by __seq, so a stale re-send is a no-op.
    if (lastNav) {
      try { res.write(`event: ${lastNav.event}\ndata: ${JSON.stringify(lastNav.data)}\n\n`); } catch {}
    }
    // Re-send any tuned parameters so a late/reconnecting sim picks them up (M4).
    // Applying a gain is idempotent, so re-sending is safe.
    for (const o of getOverrides()) {
      try { res.write(`event: param_set\ndata: ${JSON.stringify(o)}\n\n`); } catch {}
    }
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // HITL: external simulator pushes vehicle state here. We just rebroadcast.
  if (req.method === 'POST' && req.url === '/hitl/state') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const t = JSON.parse(body);
        broadcast('hitl_state', t);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end(String(e && e.message || e));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/telemetry') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const t = JSON.parse(body);
        relayTelemetry(t);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end(String(e && e.message || e));
      }
    });
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res, decodeURIComponent(req.url.split('?')[0]));
    return;
  }
  res.writeHead(405); res.end();
});

// ---------- Sim → MAVLink translation ----------

const METER_PER_DEG_LAT = 111320;
function metersPerDegLon(latDeg) {
  return 111320 * Math.cos(latDeg * Math.PI / 180);
}

function relayTelemetry(t) {
  const time_boot_ms = (Date.now() - bootMs) >>> 0;

  // The sim is authoritative for mode/arm — drive the HEARTBEAT base_mode from what
  // it reports, so the GCS shows the vehicle's TRUE state (AUTO vs MANUAL, armed) (M2).
  if (t.mode === 'AUTO' || t.mode === 'MANUAL') {
    let base = 0;
    if (t.armed !== false) base |= MODE_ARMED;
    base |= t.mode === 'AUTO' ? MODE_AUTO : MODE_MANUAL;
    modeFlags = base;
  }

  // Sim coord → world geodetic.
  // Convention: sim +X = east, sim -Z = north, sim +Y = up.
  const dLat = (-t.z) / METER_PER_DEG_LAT;
  const dLon = (t.x) / metersPerDegLon(HOME.lat);
  const lat = HOME.lat + dLat;
  const lon = HOME.lon + dLon;
  const altMSL = HOME.alt + (t.altitude || 0);

  // Velocity NED (cm/s):
  //   north = -vz_sim, east = vx_sim, down = -vy_sim
  const vN = Math.round((-t.vz) * 100);
  const vE = Math.round(( t.vx) * 100);
  const vD = Math.round((-t.vy) * 100);

  const hdgDeg = ((t.headingDeg || 0) + 360) % 360;
  const hdgCd = Math.round(hdgDeg * 100) % 36000;
  const groundspeed = Math.hypot(t.vx || 0, t.vz || 0);

  send(encodeAttitude({
    timeBootMs: time_boot_ms,
    roll: t.rollRad || 0,
    pitch: t.pitchRad || 0,
    yaw: t.yawRad || 0,
    rollspeed: 0, pitchspeed: 0, yawspeed: 0,
  }));

  send(encodeGlobalPosition({
    timeBootMs: time_boot_ms,
    lat, lon, alt: altMSL, relAlt: t.altitude || 0,
    vx: vN, vy: vE, vz: vD, hdg: hdgCd,
  }));

  send(encodeVfrHud({
    airspeed: t.speed || 0,
    groundspeed,
    alt: altMSL,
    climb: t.vsi || 0,
    heading: Math.round(hdgDeg) % 360,
    throttle: Math.round((t.throttle01 || 0) * 100),
  }));

  send(encodeGpsRaw({
    timeUsec: BigInt(Date.now()) * 1000n,
    lat, lon, alt: altMSL,
    vel: Math.round(groundspeed * 100),
    cog: hdgCd,
  }));

  // Mission progress feedback: when the autopilot in the browser advances to
  // a new waypoint, tell QGC about the transition.
  if (typeof t.missionSeq === 'number' && t.missionSeq >= 0 &&
      t.missionSeq !== lastMissionSeqReported) {
    if (lastMissionSeqReported >= 0) {
      send(encodeMissionItemReached({ seq: lastMissionSeqReported }));
    }
    send(encodeMissionCurrent({ seq: t.missionSeq }));
    lastMissionSeqReported = t.missionSeq;
  }

  telemetryCount++;
  lastTelemetryAt = Date.now();
}

// ---------- Incoming MAVLink dispatcher ----------

let inboundCount = 0;

function handleIncoming(p) {
  inboundCount++;
  switch (p.msgId) {
    case 0:    // HEARTBEAT (from GCS) — silent
      break;
    case 21:   // PARAM_REQUEST_LIST → stream every parameter
      respondParamList();
      break;
    case 20:   // PARAM_REQUEST_READ → one parameter (by index or by name)
      handleParamRequestRead(p);
      break;
    case 23:   // PARAM_SET → tune a parameter, relay to the sim, echo the new value
      handleParamSet(p);
      break;
    case 43:   // MISSION_REQUEST_LIST (download from us) → respond empty
      respondMissionEmpty(p.sys, p.comp);
      break;
    case 44:   // MISSION_COUNT (upload starting from QGC)
      handleMissionCount(p);
      break;
    case 73:   // MISSION_ITEM_INT (one waypoint from QGC)
      handleMissionItem(p);
      break;
    case 75:   // COMMAND_INT (GUIDED go-to: DO_REPOSITION with lat/lon)
      handleCommandInt(p);
      break;
    case 47:   // MISSION_ACK from GCS — silent
      break;
    case 76:   // COMMAND_LONG → ack + (optionally) extra data
      handleCommandLong(p);
      break;
    case 11:   // SET_MODE
      handleSetMode(p);
      break;
    case 66:   // REQUEST_DATA_STREAM (deprecated) — silently ignore, we already stream
      break;
    case 111:  // TIMESYNC — could echo back, skip for now
      break;
    default:
      // Uncomment to inspect what QGC sends us:
      // console.log(`[bridge] rx msgId=${p.msgId} len=${p.payload.length}`);
      break;
  }
}

function handleSetMode(p) {
  // SET_MODE v1 reordered: custom_mode(u32), target_system(u8), base_mode(u8). 6 bytes.
  if (p.payload.length < 6) return;
  const base = p.payload[5];
  modeFlags = base;
  broadcast('mode', { armed: !!(base & MODE_ARMED), auto: !!(base & MODE_AUTO) });
  console.log(`[bridge] SET_MODE base=0x${base.toString(16)}`);
}

// ----- Parameters (M4): the GCS reads/tunes autopilot gains + sensor noise -----

function sendParamValue(entry) {
  send(encodeParamValue({
    paramId: entry.id,
    paramValue: entry.value,
    paramType: 9,            // REAL32
    paramCount: paramCount(),
    paramIndex: entry.index,
  }));
}

function respondParamList() {
  for (const entry of listParams()) sendParamValue(entry);
}

function handleParamRequestRead(p) {
  const r = decodeParamRequestRead(p.payload);
  // QGC uses param_index = -1 to mean "look up by name".
  const entry = r.param_index >= 0 ? getParamByIndex(r.param_index) : getParamEntry(r.param_id);
  if (entry) sendParamValue(entry);
}

function handleParamSet(p) {
  const s = decodeParamSet(p.payload);
  const value = storeParam(s.param_id, s.param_value);
  if (value == null) return;             // unknown id — ignore
  // Relay to the sim (applies the gain live) …
  broadcast('param_set', { id: s.param_id, value });
  // … and echo PARAM_VALUE so the GCS confirms the (possibly clamped) value.
  sendParamValue(getParamEntry(s.param_id));
  console.log(`[bridge] PARAM_SET ${s.param_id} = ${value}`);
}

function respondMissionEmpty(targetSys, targetComp) {
  send(encodeMissionCount({
    targetSystem: targetSys || 255,
    targetComponent: targetComp || 0,
    count: 0,
  }));
}

function handleCommandLong(p) {
  if (p.payload.length < 30) return;
  const cmd = decodeCommandLong(p.payload);

  // 520 = MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES
  if (cmd.command === 520) {
    send(encodeAutopilotVersion({
      capabilities: 0n,
      flightSwVersion: 0x010000ff,
      vendorId: 0x4242,
      productId: 0x0001,
      uid: 0x466C696768745F31n,
    }));
  }

  // 410 = MAV_CMD_GET_HOME_POSITION
  if (cmd.command === 410) {
    send(encodeHomePosition({ lat: HOME.lat, lon: HOME.lon, alt: HOME.alt }));
  }

  // 300 = MAV_CMD_MISSION_START — engage AUTO if a mission exists.
  if (cmd.command === 300) {
    if (activeMission && activeMission.length > 0) {
      modeFlags = MODE_AUTO | MODE_ARMED;
      broadcast('mission_start', {});
      broadcast('mode', { armed: true, auto: true });
      console.log('[bridge] MISSION_START — engaging AUTO');
    } else {
      console.log('[bridge] MISSION_START requested but no mission loaded');
    }
  }

  // 400 = MAV_CMD_COMPONENT_ARM_DISARM (param1: 1=arm, 0=disarm)
  if (cmd.command === 400) {
    const arm = cmd.params[0] > 0.5;
    if (arm) modeFlags |= MODE_ARMED;
    else     modeFlags &= ~MODE_ARMED;
    broadcast('mode', { armed: arm, auto: !!(modeFlags & MODE_AUTO) });
    console.log(`[bridge] ARM_DISARM arm=${arm}`);
  }

  // 176 = MAV_CMD_DO_SET_MODE — param1 is base_mode.
  if (cmd.command === 176) {
    modeFlags = cmd.params[0] | 0;
    broadcast('mode', {
      armed: !!(modeFlags & MODE_ARMED),
      auto: !!(modeFlags & MODE_AUTO),
    });
  }

  // ----- Nav commands (M3): drive the sim autopilot via SSE -----
  // 22 = MAV_CMD_NAV_TAKEOFF (param7 = altitude)
  if (cmd.command === 22) {
    sendNav('takeoff', { alt: cmd.params[6] || 0 });
    console.log(`[bridge] NAV_TAKEOFF alt=${(cmd.params[6] || 0).toFixed(0)}`);
  }
  // 21 = MAV_CMD_NAV_LAND
  if (cmd.command === 21) { sendNav('land', {}); console.log('[bridge] NAV_LAND'); }
  // 20 = MAV_CMD_NAV_RETURN_TO_LAUNCH
  if (cmd.command === 20) { sendNav('rtl', {}); console.log('[bridge] RTL'); }
  // 192 = MAV_CMD_DO_REPOSITION sent as COMMAND_LONG (param5/6/7 = lat/lon/alt as floats)
  if (cmd.command === 192) {
    sendNav('goto', { lat: cmd.params[4], lon: cmd.params[5], alt: cmd.params[6] || 0 });
    console.log(`[bridge] DO_REPOSITION(LONG) ${cmd.params[4].toFixed(5)},${cmd.params[5].toFixed(5)}`);
  }

  // ACCEPT every command we see — keeps QGC happy. (0 = MAV_RESULT_ACCEPTED)
  send(encodeCommandAck({ command: cmd.command, result: 0 }));
}

// COMMAND_INT — QGC "Go to location" sends DO_REPOSITION (192) here with lat/lon as
// int32·1e7 (so they keep precision). Broadcast a GUIDED go-to to the sim.
function handleCommandInt(p) {
  const c = decodeCommandInt(p.payload);
  if (c.command === 192) {
    sendNav('goto', { lat: c.x / 1e7, lon: c.y / 1e7, alt: c.z || 0 });
    console.log(`[bridge] DO_REPOSITION(INT) ${(c.x / 1e7).toFixed(5)},${(c.y / 1e7).toFixed(5)} alt=${c.z}`);
  }
  send(encodeCommandAck({ command: c.command, result: 0 }));
}

// ---------- Boot ----------

server.listen(HTTP_PORT, () => {
  console.log('--- flight-sim2 ↔ QGroundControl bridge ---');
  console.log(`  Sim served at:  http://localhost:${HTTP_PORT}/`);
  console.log(`  MAVLink TX → UDP ${QGC_HOST}:${QGC_PORT}`);
  console.log(`  MAVLink RX ← UDP 0.0.0.0:${BIND_PORT}`);
  console.log(`  Home position:  ${HOME.lat.toFixed(4)}°, ${HOME.lon.toFixed(4)}° (${HOME.alt}m)`);
  console.log('  Open QGroundControl, then open the sim URL above and fly.');
  console.log('  Ctrl+C to stop.');
});

setInterval(() => {
  const idle = Date.now() - lastTelemetryAt;
  const status = idle < 2000 ? 'LIVE' : 'idle';
  console.log(`[bridge] ${status} · tx=${telemetryCount} rx=${inboundCount} · idle ${idle}ms`);
}, 5000);
