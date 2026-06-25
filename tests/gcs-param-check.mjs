// M4 GCS-parameter acceptance check (headless, no QGroundControl needed).
//
// Spins up the bridge + a "fake GCS" UDP endpoint and exercises the full
// parameter protocol the bridge is responsible for:
//   1. PARAM_REQUEST_LIST → a PARAM_VALUE for every parameter (correct count).
//   2. PARAM_REQUEST_READ by name (index=-1) → that one PARAM_VALUE.
//   3. PARAM_SET → PARAM_VALUE echo with the new value (and an SSE relay to the sim).
//   4. PARAM_SET out of range → echo CLAMPED to the parameter's limit.
//
// The bridge decoder does not verify CRC, so synthesized packets parse regardless
// of crc_extra. Run: `node tests/gcs-param-check.mjs`
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { encodePacket, decode } from '../bridge/mavlink.mjs';
import { paramCount } from '../src/params.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QGC_PORT = 14550, BRIDGE_RX = 14555, HTTP = 8765;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PARAM_VALUE = 22;

function writeId(buf, off, id) { for (let i = 0; i < id.length && i < 16; i++) buf[off + i] = id.charCodeAt(i); }

// ---- synthesize GCS → bridge param packets ----
function paramRequestList() {
  const buf = new Uint8Array(2); buf[0] = 1; buf[1] = 1;
  return encodePacket({ msgId: 21, payload: buf, crcExtra: 159, sys: 255, comp: 190 });
}
function paramRequestRead(id, index = -1) {
  const buf = new Uint8Array(20); const dv = new DataView(buf.buffer);
  dv.setInt16(0, index, true); buf[2] = 1; buf[3] = 1; writeId(buf, 4, id);
  return encodePacket({ msgId: 20, payload: buf, crcExtra: 214, sys: 255, comp: 190 });
}
function paramSet(id, value) {
  const buf = new Uint8Array(23); const dv = new DataView(buf.buffer);
  dv.setFloat32(0, value, true); buf[4] = 1; buf[5] = 1; writeId(buf, 6, id); buf[22] = 9;
  return encodePacket({ msgId: 23, payload: buf, crcExtra: 168, sys: 255, comp: 190 });
}

function decodeParamValue(p) {
  const dv = new DataView(p.payload.buffer, p.payload.byteOffset, p.payload.byteLength);
  let id = '';
  for (let i = 0; i < 16; i++) { const c = p.payload[8 + i]; if (!c) break; id += String.fromCharCode(c); }
  return { value: dv.getFloat32(0, true), count: dv.getUint16(4, true), index: dv.getUint16(6, true), id };
}

const rx = [];
const params = () => rx.filter((p) => p.msgId === PARAM_VALUE).map(decodeParamValue);
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

let bridge;
try {
  const sock = createSocket('udp4');
  sock.on('message', (msg) => { for (const p of decode(msg)) if (p.version === 1) rx.push(p); });
  await new Promise((res, rej) => { sock.once('error', rej); sock.bind(QGC_PORT, res); });
  const toBridge = (buf) => sock.send(buf, 0, buf.length, BRIDGE_RX, '127.0.0.1');

  bridge = spawn('node', ['bridge/server.mjs'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1700);

  // 1) PARAM_REQUEST_LIST → one PARAM_VALUE per parameter
  rx.length = 0;
  toBridge(paramRequestList());
  await sleep(400);
  const list = params();
  const N = paramCount();
  check('PARAM_REQUEST_LIST streams every param', list.length >= N, `(${list.length}/${N})`);
  check('PARAM_VALUE.param_count = N', list.every((p) => p.count === N), `count=${list[0] && list[0].count}`);
  const pk = list.find((p) => p.id === 'AP_PITCH_KP');
  check('AP_PITCH_KP default = 1.0', pk && Math.abs(pk.value - 1.0) < 1e-5, pk ? `=${pk.value}` : '(missing)');

  // 2) PARAM_REQUEST_READ by name (index -1)
  rx.length = 0;
  toBridge(paramRequestRead('AP_TGT_SPEED', -1));
  await sleep(300);
  const one = params();
  check('PARAM_REQUEST_READ by name → single PARAM_VALUE', one.length === 1 && one[0].id === 'AP_TGT_SPEED',
    `(${one.length})`);
  check('AP_TGT_SPEED default = 50', one[0] && Math.abs(one[0].value - 50) < 1e-5, one[0] ? `=${one[0].value}` : '');

  // 3) PARAM_SET → echo with the new value
  rx.length = 0;
  toBridge(paramSet('AP_PITCH_KP', 2.5));
  await sleep(300);
  const echo = params().find((p) => p.id === 'AP_PITCH_KP');
  check('PARAM_SET echoes the new value', echo && Math.abs(echo.value - 2.5) < 1e-5, echo ? `=${echo.value}` : '(none)');
  // Persistence: read it back from the bridge — it must still report 2.5.
  rx.length = 0;
  toBridge(paramRequestRead('AP_PITCH_KP', -1));
  await sleep(300);
  const readback = params().find((p) => p.id === 'AP_PITCH_KP');
  check('bridge persists the set (read-back = 2.5)', readback && Math.abs(readback.value - 2.5) < 1e-5,
    readback ? `=${readback.value}` : '(none)');

  // 4) PARAM_SET out of range → clamped to the declared max (AP_MAXBANK max=45)
  rx.length = 0;
  toBridge(paramSet('AP_MAXBANK', 999));
  await sleep(300);
  const clamped = params().find((p) => p.id === 'AP_MAXBANK');
  check('PARAM_SET clamps to range (AP_MAXBANK ≤ 45)', clamped && Math.abs(clamped.value - 45) < 1e-5,
    clamped ? `=${clamped.value}` : '(none)');

  sock.close();
} finally {
  if (bridge) bridge.kill('SIGKILL');
}

const passed = results.filter(Boolean).length;
const ok = passed === results.length && results.length > 0;
console.log(`\ngcs-param-check: ${ok ? 'PASS' : 'FAIL'} — ${passed}/${results.length}`);
process.exit(ok ? 0 : 1);
