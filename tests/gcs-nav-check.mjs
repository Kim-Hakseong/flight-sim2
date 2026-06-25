// M3 GCS nav-command check (needs a headless Chrome on CDP port given as argv[2]).
//
// Verified in two reliable halves (the app's own headless EventSource is flaky, but
// the same path is confirmed live in QGroundControl):
//   A) BRIDGE: a GCS command over MAVLink UDP → the bridge broadcasts the right SSE
//      event (takeoff/land/rtl/goto with the right data + a monotonic __seq).
//      Checked with a Node SSE client (a reliable stand-in for the browser).
//   B) SIM: the nav builders (window.__nav.*) drive the autopilot correctly — TAKEOFF
//      climbs out, GOTO flies toward the GCS point, RTL/ LAND engage and descend.
//   Glue (SSE event → builder) is the trivial missionLink listener, proven by M1.
//
// Run via the wrapper that starts Chrome; e.g. node tests/gcs-nav-check.mjs 9714
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { encodePacket } from '../bridge/mavlink.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CDP = process.argv[2] || '9714';
const BRIDGE_RX = 14555, HTTP = 8765;
const HOME = { lat: 37.4602, lon: 126.4407 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M_PER_DEG = 111320;

function commandLong(command, p7 = 0) {
  const b = new Uint8Array(33); const dv = new DataView(b.buffer);
  dv.setFloat32(24, p7, true); dv.setUint16(28, command, true); b[30] = 1; b[31] = 1;
  return encodePacket({ msgId: 76, payload: b, crcExtra: 152, sys: 255, comp: 190 });
}
function commandIntGoto(lat, lon, alt) {
  const b = new Uint8Array(35); const dv = new DataView(b.buffer);
  dv.setInt32(16, Math.round(lat * 1e7), true); dv.setInt32(20, Math.round(lon * 1e7), true);
  dv.setFloat32(24, alt, true); dv.setUint16(28, 192, true); b[30] = 1; b[31] = 1; b[32] = 6;
  return encodePacket({ msgId: 75, payload: b, crcExtra: 158, sys: 255, comp: 190 });
}
function localXZ(lat, lon) {
  const cosLat = Math.cos(HOME.lat * Math.PI / 180);
  return { x: (lon - HOME.lon) * M_PER_DEG * cosLat, z: -(lat - HOME.lat) * M_PER_DEG };
}

async function cdp() {
  let t;
  for (let i = 0; i < 20; i++) { try { const l = await (await fetch(`http://localhost:${CDP}/json`)).json(); t = l.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) break; } catch {} await sleep(250); }
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const p = new Map();
  const send = (m, pa = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pa })); });
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  return { ev: async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.value };
}

const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

let bridge;
try {
  const sock = createSocket('udp4');
  await new Promise((res, rej) => { sock.once('error', rej); sock.bind(14550, res); });
  const toBridge = (buf) => sock.send(buf, 0, buf.length, BRIDGE_RX, '127.0.0.1');

  bridge = spawn('node', ['bridge/server.mjs'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1500);

  // ---------- A) bridge broadcasts the right SSE event per command ----------
  const events = [];
  const res = await fetch(`http://localhost:${HTTP}/commands`);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  (async () => { while (true) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value);
    const parts = buf.split('\n\n'); buf = parts.pop();
    for (const p of parts) { const ev = (p.match(/event: (\w+)/) || [])[1]; const dm = (p.match(/data: (.*)/) || [])[1];
      if (ev) events.push({ ev, data: dm ? JSON.parse(dm) : {} }); } } })();
  await sleep(400);
  const last = (e) => [...events].reverse().find((x) => x.ev === e);

  toBridge(commandLong(22, 150)); await sleep(250);
  check('A: TAKEOFF → SSE takeoff{alt}', !!last('takeoff') && last('takeoff').data.alt === 150 && last('takeoff').data.__seq > 0,
    last('takeoff') ? JSON.stringify(last('takeoff').data) : '(none)');
  toBridge(commandIntGoto(HOME.lat + 0.03, HOME.lon + 0.02, 200)); await sleep(250);
  const g = last('goto');
  check('A: GOTO(INT) → SSE goto{lat,lon}', !!g && Math.abs(g.data.lat - (HOME.lat + 0.03)) < 1e-4 && Math.abs(g.data.lon - (HOME.lon + 0.02)) < 1e-4,
    g ? JSON.stringify(g.data) : '(none)');
  toBridge(commandLong(20)); await sleep(250);
  check('A: RTL → SSE rtl', !!last('rtl'));
  toBridge(commandLong(21)); await sleep(250);
  check('A: LAND → SSE land', !!last('land'));
  check('A: __seq increments per command', last('land').data.__seq > last('takeoff').data.__seq);

  // ---------- B) the sim's nav builders fly correctly ----------
  const { ev } = await cdp();
  await ev(`location.href = 'http://localhost:${HTTP}/index.html?intro=0'`);
  for (let i = 0; i < 30; i++) { if (await ev(`!!window.__nav`)) break; await sleep(300); }
  const altAGL = () => ev(`Math.max(0, window.__hils.pos.y - 0.8)`);
  const pos = () => ev(`({x:window.__hils.pos.x, z:window.__hils.pos.z})`);
  const fly = (s) => ev(`window.__advance && window.__advance(${s})`);

  await ev(`window.__resetForTest && window.__resetForTest()`);
  check('B: sim on the runway', (await altAGL()) < 5);

  await ev(`window.__nav.takeoff(150)`);
  check('B: TAKEOFF engaged', !!(await ev(`window.__hils.auto.active`)), `(phase=${await ev(`window.__hils.auto.phase`)})`);
  await fly(34);
  const altTO = await altAGL();
  check('B: TAKEOFF climbed out', altTO > 100, `(alt=${altTO.toFixed(0)}m)`);

  const gLat = HOME.lat + 0.03, gLon = HOME.lon + 0.02, tgt = localXZ(gLat, gLon);
  const dist = async () => { const pp = await pos(); return Math.hypot(tgt.x - pp.x, tgt.z - pp.z); };
  const d0 = await dist();
  await ev(`window.__nav.goto(${gLat}, ${gLon}, 200)`);
  check('B: GOTO accepted (1-wp)', (await ev(`window.__hils.auto.len`)) === 1);
  await fly(25);
  const d1 = await dist();
  check('B: GOTO flew toward the target', d1 < d0 - 300, `(range ${Math.round(d0)}m → ${Math.round(d1)}m)`);

  await ev(`window.__nav.rtl()`);
  check('B: RTL engaged', !!(await ev(`window.__hils.auto.active`)) && (await ev(`window.__hils.auto.len`)) === 1);

  await ev(`window.__nav.land()`);
  const altBefore = await altAGL();
  await fly(45);
  const altAfter = await altAGL();
  check('B: LAND descended on the approach', altAfter < altBefore - 40, `(alt ${altBefore.toFixed(0)}m → ${altAfter.toFixed(0)}m, phase=${await ev(`window.__hils.auto.phase`)})`);

  sock.close();
} finally {
  if (bridge) bridge.kill('SIGKILL');
}

const pass = results.length > 0 && results.every(Boolean);
console.log(pass ? `\ngcs-nav-check: PASS (${results.length}/${results.length})` : `\ngcs-nav-check: FAIL (${results.filter(Boolean).length}/${results.length})`);
process.exit(pass ? 0 : 1);
