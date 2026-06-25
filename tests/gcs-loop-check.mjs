// M1 GCS-loop acceptance check (headless, no QGroundControl needed).
//
// Spins up the bridge and a "fake GCS" UDP endpoint bound to the QGC port, then
// exercises the whole MAVLink round-trip the bridge is responsible for:
//   1. 1 Hz HEARTBEAT reaches the GCS.
//   2. POST /telemetry → ATTITUDE / GLOBAL_POSITION_INT / VFR_HUD / GPS_RAW_INT
//      with geodetically-sane values (sim local coords → lat/lon/alt).
//   3. Mission upload handshake: COUNT → REQUEST_INT(seq) → ITEM_INT → ACK.
//   4. MISSION_START (COMMAND_LONG 300) → COMMAND_ACK + bridge engages AUTO
//      (HEARTBEAT base_mode gains the AUTO bit).
//
// The bridge's decoder does not verify CRC, so the synthesized GCS packets parse
// regardless of crc_extra. Run: `node tests/gcs-loop-check.mjs`
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { encodePacket, encodeMissionCount, decode } from '../bridge/mavlink.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QGC_PORT = 14550, BRIDGE_RX = 14555, HTTP = 8765;
const HOME = { lat: 37.4602, lon: 126.4407, alt: 7 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MSG = { HEARTBEAT: 0, GPS_RAW: 24, ATTITUDE: 30, GLOBAL_POS: 33, VFR_HUD: 74,
  MISSION_REQUEST_INT: 51, MISSION_ACK: 47, COMMAND_ACK: 77 };

// ---- synthesize GCS → vehicle packets (CRC not checked by the bridge) ----
function missionItemInt({ seq, lat, lon, alt, command = 16 }) {
  const buf = new Uint8Array(37); const dv = new DataView(buf.buffer);
  dv.setInt32(16, Math.round(lat * 1e7), true);
  dv.setInt32(20, Math.round(lon * 1e7), true);
  dv.setFloat32(24, alt, true);
  dv.setUint16(28, seq, true);
  dv.setUint16(30, command, true);
  buf[32] = 1; buf[33] = 1; buf[34] = 6; buf[35] = seq === 0 ? 1 : 0; buf[36] = 1; // frame=6 (rel-alt int)
  return encodePacket({ msgId: 73, payload: buf, crcExtra: 38, sys: 255, comp: 190 });
}
function commandLong({ command, p1 = 0 }) {
  const buf = new Uint8Array(33); const dv = new DataView(buf.buffer);
  dv.setFloat32(0, p1, true);
  dv.setUint16(28, command, true);
  buf[30] = 1; buf[31] = 1; buf[32] = 0;
  return encodePacket({ msgId: 76, payload: buf, crcExtra: 152, sys: 255, comp: 190 });
}

const rx = [];
function got(id) { return rx.filter((p) => p.msgId === id); }
function decodeGlobalPos(p) {
  const dv = new DataView(p.payload.buffer, p.payload.byteOffset, p.payload.byteLength);
  return { lat: dv.getInt32(4, true) / 1e7, lon: dv.getInt32(8, true) / 1e7,
    altMm: dv.getInt32(12, true), relAltMm: dv.getInt32(16, true), hdg: dv.getUint16(26, true) };
}
function heartbeatBaseMode(p) { return p.payload[6]; } // after custom_mode(u32),type,autopilot

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

let bridge;
try {
  // fake GCS first, so we catch the bridge's boot heartbeats
  const sock = createSocket('udp4');
  sock.on('message', (msg) => { for (const p of decode(msg)) if (p.version === 1) rx.push(p); });
  await new Promise((res, rej) => { sock.once('error', rej); sock.bind(QGC_PORT, res); });
  const toBridge = (buf) => sock.send(buf, 0, buf.length, BRIDGE_RX, '127.0.0.1');

  bridge = spawn('node', ['bridge/server.mjs'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1700);

  // 1) HEARTBEAT
  check('HEARTBEAT received', got(MSG.HEARTBEAT).length > 0, `(${got(MSG.HEARTBEAT).length})`);

  // 2) telemetry translation
  rx.length = 0;
  const tele = { x: 200, z: -800, y: 0, vx: 52, vy: 3, vz: -1, speed: 52.1, altitude: 150,
    rollRad: 0.12, pitchRad: 0.06, yawRad: 0.3, headingDeg: 17, throttle01: 1, vsi: 4, missionSeq: -1 };
  await fetch(`http://localhost:${HTTP}/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tele) });
  await sleep(300);
  check('ATTITUDE (30)', got(MSG.ATTITUDE).length > 0);
  check('GLOBAL_POSITION_INT (33)', got(MSG.GLOBAL_POS).length > 0);
  check('VFR_HUD (74)', got(MSG.VFR_HUD).length > 0);
  check('GPS_RAW_INT (24)', got(MSG.GPS_RAW).length > 0);
  if (got(MSG.GLOBAL_POS).length) {
    const g = decodeGlobalPos(got(MSG.GLOBAL_POS)[0]);
    // sim z=-800 → +800 m north; x=200 → east. lat should be > home, lon > home; relAlt 150 m.
    const latOk = g.lat > HOME.lat && g.lat < HOME.lat + 0.02;
    const lonOk = g.lon > HOME.lon && g.lon < HOME.lon + 0.02;
    const altOk = Math.abs(g.relAltMm - 150000) < 1000;
    check('GLOBAL_POSITION lat/lon/alt sane', latOk && lonOk && altOk,
      `lat=${g.lat.toFixed(4)} lon=${g.lon.toFixed(4)} relAlt=${(g.relAltMm / 1000).toFixed(0)}m hdg=${(g.hdg / 100).toFixed(0)}`);
  }

  // 2b) sim-authoritative mode/arm reflected in HEARTBEAT (M2)
  const postTele = (extra) => fetch(`http://localhost:${HTTP}/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 0, z: 0, y: 0, altitude: 100, headingDeg: 0, ...extra }) });
  rx.length = 0;
  await postTele({ mode: 'AUTO', armed: true });
  await sleep(1300);
  let hb = got(MSG.HEARTBEAT);
  check('HEARTBEAT reflects sim AUTO', hb.length > 0 && (heartbeatBaseMode(hb[hb.length - 1]) & 0x04) !== 0,
    hb.length ? `base_mode=0x${heartbeatBaseMode(hb[hb.length - 1]).toString(16)}` : '');
  rx.length = 0;
  await postTele({ mode: 'MANUAL', armed: false });
  await sleep(1300);
  hb = got(MSG.HEARTBEAT);
  const bm = hb.length ? heartbeatBaseMode(hb[hb.length - 1]) : 0;
  check('HEARTBEAT reflects sim MANUAL + DISARMED', hb.length > 0 && (bm & 0x04) === 0 && (bm & 0x80) === 0,
    `base_mode=0x${bm.toString(16)}`);
  // restore armed for the mission-start check
  await postTele({ mode: 'MANUAL', armed: true });
  await sleep(300);

  // 3) mission upload handshake (2 waypoints)
  rx.length = 0;
  toBridge(encodeMissionCount({ targetSystem: 1, targetComponent: 1, count: 2 }));
  await sleep(250);
  check('MISSION_REQUEST_INT seq0 (51)', got(MSG.MISSION_REQUEST_INT).length > 0);
  toBridge(missionItemInt({ seq: 0, lat: HOME.lat + 0.005, lon: HOME.lon + 0.003, alt: 120 }));
  await sleep(250);
  const reqs = got(MSG.MISSION_REQUEST_INT).length;
  check('MISSION_REQUEST_INT seq1', reqs >= 2, `(reqs=${reqs})`);
  toBridge(missionItemInt({ seq: 1, lat: HOME.lat + 0.008, lon: HOME.lon + 0.006, alt: 120 }));
  await sleep(250);
  check('MISSION_ACK (47)', got(MSG.MISSION_ACK).length > 0);

  // 4) mission start → AUTO
  rx.length = 0;
  toBridge(commandLong({ command: 300 }));   // MAV_CMD_MISSION_START
  await sleep(300);
  check('COMMAND_ACK (77)', got(MSG.COMMAND_ACK).length > 0);
  await sleep(1300); // catch the next heartbeat with the new mode
  const hbs = got(MSG.HEARTBEAT);
  const autoEngaged = hbs.length > 0 && (heartbeatBaseMode(hbs[hbs.length - 1]) & 0x04) !== 0; // MODE_AUTO bit
  check('HEARTBEAT base_mode now AUTO', autoEngaged,
    hbs.length ? `base_mode=0x${heartbeatBaseMode(hbs[hbs.length - 1]).toString(16)}` : '(no hb)');

  sock.close();
} finally {
  if (bridge) bridge.kill('SIGKILL');
}

const pass = results.length > 0 && results.every(Boolean);
console.log(pass ? `\ngcs-loop-check: PASS (${results.length}/${results.length})` : `\ngcs-loop-check: FAIL (${results.filter(Boolean).length}/${results.length})`);
process.exit(pass ? 0 : 1);
