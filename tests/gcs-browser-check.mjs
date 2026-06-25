// M1 browser-side GCS loop check (needs a headless Chrome on CDP port given as argv[2]).
//
// Closes the OTHER half of the loop the packet-level gcs-loop-check doesn't cover:
//   QGC ──(UDP)──▶ bridge ──(SSE)──▶ browser autopilot ──(POST /telemetry)──▶ bridge ──(UDP)──▶ QGC
//
//   1. Serve the sim FROM the bridge; the browser's missionLink connects to /commands.
//   2. Upload a 2-wp mission over UDP → the browser autopilot receives it (__hils.auto.len).
//   3. MISSION_START over UDP → the autopilot engages (__hils.auto.active).
//   4. The flying browser POSTs telemetry → the bridge relays GLOBAL_POSITION_INT back
//      to the fake GCS (proves the full round-trip).
//
// Run via the wrapper that starts Chrome; e.g. node tests/gcs-browser-check.mjs 9704
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { encodePacket, encodeMissionCount, decode } from '../bridge/mavlink.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CDP = process.argv[2] || '9704';
const QGC_PORT = 14550, BRIDGE_RX = 14555, HTTP = 8765;
const HOME = { lat: 37.4602, lon: 126.4407 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function missionItemInt({ seq, lat, lon, alt }) {
  const b = new Uint8Array(37); const dv = new DataView(b.buffer);
  dv.setInt32(16, Math.round(lat * 1e7), true); dv.setInt32(20, Math.round(lon * 1e7), true);
  dv.setFloat32(24, alt, true); dv.setUint16(28, seq, true); dv.setUint16(30, 16, true);
  b[32] = 1; b[33] = 1; b[34] = 6; b[35] = seq === 0 ? 1 : 0; b[36] = 1;
  return encodePacket({ msgId: 73, payload: b, crcExtra: 38, sys: 255, comp: 190 });
}
function commandLong(command) {
  const b = new Uint8Array(33); const dv = new DataView(b.buffer);
  dv.setUint16(28, command, true); b[30] = 1; b[31] = 1;
  return encodePacket({ msgId: 76, payload: b, crcExtra: 152, sys: 255, comp: 190 });
}
function paramSet(id, value) {
  const b = new Uint8Array(23); const dv = new DataView(b.buffer);
  dv.setFloat32(0, value, true); b[4] = 1; b[5] = 1;
  for (let i = 0; i < id.length && i < 16; i++) b[6 + i] = id.charCodeAt(i);
  b[22] = 9;
  return encodePacket({ msgId: 23, payload: b, crcExtra: 168, sys: 255, comp: 190 });
}

// ---- CDP helper ----
async function cdp() {
  let t;
  for (let i = 0; i < 20; i++) {
    try { const l = await (await fetch(`http://localhost:${CDP}/json`)).json(); t = l.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) break; } catch {}
    await sleep(250);
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const p = new Map();
  const send = (m, pa = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pa })); });
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.value;
  return { send, ev, ws };
}

const rx = [];
const got = (id) => rx.filter((p) => p.msgId === id);
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

let bridge;
try {
  const sock = createSocket('udp4');
  sock.on('message', (m) => { for (const p of decode(m)) if (p.version === 1) rx.push(p); });
  await new Promise((res, rej) => { sock.once('error', rej); sock.bind(QGC_PORT, res); });
  const toBridge = (buf) => sock.send(buf, 0, buf.length, BRIDGE_RX, '127.0.0.1');

  bridge = spawn('node', ['bridge/server.mjs'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1500);

  const { ev } = await cdp();
  await ev(`location.href = 'http://localhost:${HTTP}/index.html?intro=0'`); // load sim FROM the bridge
  // poll until main.js has run …
  let loaded = false;
  for (let i = 0; i < 30; i++) { if (await ev(`!!window.__hils`)) { loaded = true; break; } await sleep(300); }
  // … AND the EventSource is actually CONNECTED. Broadcasting before the handshake
  // completes drops the event (the client isn't in sseClients yet) — that race is
  // what made this check flaky. window.__linkOnline() flips true once 'open' fires,
  // by which point the bridge has already added the client, so delivery is assured.
  let linkUp = false;
  for (let i = 0; i < 40; i++) { if (await ev(`window.__linkOnline && window.__linkOnline()`)) { linkUp = true; break; } await sleep(150); }
  await sleep(200);
  check('sim loaded from bridge', loaded && linkUp, linkUp ? '' : '(SSE link never came online)');
  check('autopilot starts with no mission', (await ev(`window.__hils.auto.len`)) === 0, `(len=${await ev(`window.__hils.auto.len`)})`);

  // Re-send the UDP command each attempt until its SSE effect lands on the browser.
  // The bridge handlers are idempotent (the mission handshake / mode / param relay
  // re-broadcast on every receipt), so a re-send simply triggers a fresh broadcast —
  // robust against the headless EventSource occasionally dropping the first event.
  const until = async (predicate, sendFn, tries = 8, gap = 350) => {
    for (let i = 0; i < tries; i++) {
      sendFn(); await sleep(gap);
      if (await predicate()) return true;
    }
    return false;
  };

  // upload mission over UDP (whole handshake re-sent per attempt)
  const uploadMission = () => {
    toBridge(encodeMissionCount({ targetSystem: 1, targetComponent: 1, count: 2 }));
    setTimeout(() => toBridge(missionItemInt({ seq: 0, lat: HOME.lat + 0.01, lon: HOME.lon, alt: 150 })), 80);
    setTimeout(() => toBridge(missionItemInt({ seq: 1, lat: HOME.lat + 0.02, lon: HOME.lon + 0.01, alt: 150 })), 160);
  };
  const gotMission = await until(async () => (await ev(`window.__hils.auto.len`)) >= 2, uploadMission);
  check('browser autopilot received the mission (SSE)', gotMission, `(len=${await ev(`window.__hils.auto.len`)})`);

  // start mission over UDP
  const active = await until(async () => !!(await ev(`window.__hils.auto.active`)), () => toBridge(commandLong(300)));
  check('autopilot engaged on MISSION_START', active, `(phase=${await ev(`window.__hils.auto.phase`)})`);

  // let the browser fly real-time; confirm telemetry round-trips back to the GCS
  rx.length = 0;
  await sleep(4000);
  check('browser telemetry reaches the GCS (GLOBAL_POSITION_INT)', got(33).length > 0, `(${got(33).length} frames)`);

  // GCS DISARM (COMMAND_LONG 400, param1=0) must cut the sim's engine
  const disarmed = await until(async () => (await ev(`window.__arm()`)) === false, () => toBridge(commandLong(400)));
  check('GCS DISARM disarms the sim', disarmed);
  await sleep(600);
  const thr = await ev(`window.__hils.diag.thr`);
  check('DISARM cuts the throttle to 0', thr === 0, `(thr=${thr})`);

  // GCS PARAM_SET (M4) over UDP → bridge SSE → the sim applies the gain live.
  const applied = await until(async () => (await ev(`window.__params.get('AP_TGT_SPEED')`)) === 70,
    () => toBridge(paramSet('AP_TGT_SPEED', 70)));
  check('GCS PARAM_SET reaches & tunes the sim', applied, `(AP_TGT_SPEED=${await ev(`window.__params.get('AP_TGT_SPEED')`)})`);

  sock.close();
} finally {
  if (bridge) bridge.kill('SIGKILL');
}

const pass = results.length > 0 && results.every(Boolean);
console.log(pass ? `\ngcs-browser-check: PASS (${results.length}/${results.length})` : `\ngcs-browser-check: FAIL (${results.filter(Boolean).length}/${results.length})`);
process.exit(pass ? 0 : 1);
