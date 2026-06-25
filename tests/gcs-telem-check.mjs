// M6 telemetry-completeness acceptance check (headless, no QGroundControl needed).
//
// Spins up the bridge + a "fake GCS" UDP endpoint and verifies the telemetry the
// bridge adds in M6:
//   1. SYS_STATUS carries the REAL battery from telemetry (voltage/current/remaining).
//   2. EKF_STATUS_REPORT streams; healthy → low variance, no glitch flag.
//   3. nav-degraded → EKF raises pos variance + sets the GPS-glitch flag + STATUSTEXT.
//   4. Lifecycle STATUSTEXT on arm/disarm and mode change.
//
// Run: `node tests/gcs-telem-check.mjs`
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decode } from '../bridge/mavlink.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QGC_PORT = 14550, BRIDGE_RX = 14555, HTTP = 8765;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SYS_STATUS = 1, STATUSTEXT = 253, EKF = 193;
const EKF_GPS_GLITCH = 1024;

const rx = [];
const sysStatus = () => rx.filter((p) => p.msgId === SYS_STATUS).map((p) => {
  const dv = new DataView(p.payload.buffer, p.payload.byteOffset, p.payload.byteLength);
  return { mV: dv.getUint16(14, true), cA: dv.getInt16(16, true), pct: dv.getInt8(30) };
});
const ekf = () => rx.filter((p) => p.msgId === EKF).map((p) => {
  const dv = new DataView(p.payload.buffer, p.payload.byteOffset, p.payload.byteLength);
  return { velVar: dv.getFloat32(0, true), posHoriz: dv.getFloat32(4, true), flags: dv.getUint16(20, true) };
});
const texts = () => rx.filter((p) => p.msgId === STATUSTEXT).map((p) => {
  let s = ''; for (let i = 1; i < p.payload.length; i++) { const c = p.payload[i]; if (!c) break; s += String.fromCharCode(c); } return s;
});
const post = (extra) => fetch(`http://localhost:${HTTP}/telemetry`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ x: 0, z: 0, y: 0, altitude: 100, headingDeg: 0, ...extra }),
});

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

let bridge;
try {
  const sock = createSocket('udp4');
  sock.on('message', (msg) => { for (const p of decode(msg)) if (p.version === 1) rx.push(p); });
  await new Promise((res, rej) => { sock.once('error', rej); sock.bind(QGC_PORT, res); });

  bridge = spawn('node', ['bridge/server.mjs'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1700);

  // 1) real battery in SYS_STATUS
  rx.length = 0;
  await post({ mode: 'MANUAL', armed: true, battV: 11.1, battA: 22.5, battPct: 63, navDegraded: false });
  await sleep(1300);
  const ss = sysStatus();
  const b = ss[ss.length - 1];
  check('SYS_STATUS carries real battery voltage', b && b.mV === 11100, b ? `${b.mV}mV` : '(none)');
  check('SYS_STATUS battery current + remaining', b && b.cA === 2250 && b.pct === 63, b ? `${b.cA}cA ${b.pct}%` : '');

  // 2) EKF healthy
  const eh = ekf();
  const e0 = eh[eh.length - 1];
  check('EKF_STATUS_REPORT streaming, healthy', e0 && (e0.flags & EKF_GPS_GLITCH) === 0 && e0.posHoriz < 0.5,
    e0 ? `flags=0x${e0.flags.toString(16)} posVar=${e0.posHoriz}` : '(none)');

  // 3) nav degraded → EKF glitch flag + high variance + STATUSTEXT
  rx.length = 0;
  await post({ mode: 'MANUAL', armed: true, navDegraded: true });
  await sleep(1100);
  const ed = ekf();
  const e1 = ed[ed.length - 1];
  check('EKF flags GPS glitch + high pos variance when degraded',
    e1 && (e1.flags & EKF_GPS_GLITCH) !== 0 && e1.posHoriz > 0.5,
    e1 ? `flags=0x${e1.flags.toString(16)} posVar=${e1.posHoriz}` : '(none)');
  check('STATUSTEXT "Nav degraded" fires', texts().some((s) => /degraded/i.test(s)));

  // 4) lifecycle: disarm + mode change → STATUSTEXT
  rx.length = 0;
  await post({ mode: 'AUTO', armed: true, navDegraded: false });   // mode MANUAL→AUTO
  await sleep(400);
  await post({ mode: 'AUTO', armed: false });                       // armed true→false
  await sleep(800);
  const tx = texts();
  check('STATUSTEXT "Mode: AUTO" on mode change', tx.some((s) => /Mode:\s*AUTO/i.test(s)), tx.join(' | '));
  check('STATUSTEXT "Disarmed" on disarm', tx.some((s) => /disarmed/i.test(s)));

  sock.close();
} finally {
  if (bridge) bridge.kill('SIGKILL');
}

const passed = results.filter(Boolean).length;
const ok = passed === results.length && results.length > 0;
console.log(`\ngcs-telem-check: ${ok ? 'PASS' : 'FAIL'} — ${passed}/${results.length}`);
process.exit(ok ? 0 : 1);
