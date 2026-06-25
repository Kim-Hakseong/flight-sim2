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
  // poll until main.js has run AND missionLink's SSE is connected (re-sends fire on connect)
  let sseOk = false;
  for (let i = 0; i < 30; i++) { if (await ev(`!!window.__hils`)) { sseOk = true; break; } await sleep(300); }
  await sleep(1000); // let the EventSource finish its handshake before we broadcast
  check('sim loaded from bridge', sseOk);
  check('autopilot starts with no mission', (await ev(`window.__hils.auto.len`)) === 0, `(len=${await ev(`window.__hils.auto.len`)})`);

  // upload mission over UDP
  toBridge(encodeMissionCount({ targetSystem: 1, targetComponent: 1, count: 2 }));
  await sleep(300);
  toBridge(missionItemInt({ seq: 0, lat: HOME.lat + 0.01, lon: HOME.lon, alt: 150 }));
  await sleep(300);
  toBridge(missionItemInt({ seq: 1, lat: HOME.lat + 0.02, lon: HOME.lon + 0.01, alt: 150 }));
  // poll for the SSE mission to land on the browser autopilot
  let len = 0;
  for (let i = 0; i < 20; i++) { len = await ev(`window.__hils.auto.len`); if (len >= 2) break; await sleep(250); }
  check('browser autopilot received the mission (SSE)', len >= 2, `(len=${len})`);

  // start mission over UDP
  toBridge(commandLong(300));
  let active = false;
  for (let i = 0; i < 20; i++) { active = await ev(`window.__hils.auto.active`); if (active) break; await sleep(250); }
  check('autopilot engaged on MISSION_START', !!active, `(phase=${await ev(`window.__hils.auto.phase`)})`);

  // let the browser fly real-time; confirm telemetry round-trips back to the GCS
  rx.length = 0;
  await sleep(4000);
  check('browser telemetry reaches the GCS (GLOBAL_POSITION_INT)', got(33).length > 0, `(${got(33).length} frames)`);

  // GCS DISARM (COMMAND_LONG 400, param1=0) must cut the sim's engine
  toBridge(commandLong(400));
  let disarmed = false;
  for (let i = 0; i < 20; i++) { if ((await ev(`window.__arm()`)) === false) { disarmed = true; break; } await sleep(250); }
  check('GCS DISARM disarms the sim', disarmed);
  await sleep(600);
  const thr = await ev(`window.__hils.diag.thr`);
  check('DISARM cuts the throttle to 0', thr === 0, `(thr=${thr})`);

  sock.close();
} finally {
  if (bridge) bridge.kill('SIGKILL');
}

const pass = results.length > 0 && results.every(Boolean);
console.log(pass ? `\ngcs-browser-check: PASS (${results.length}/${results.length})` : `\ngcs-browser-check: FAIL (${results.filter(Boolean).length}/${results.length})`);
process.exit(pass ? 0 : 1);
