// M5 GCS fault-visibility acceptance check (headless, no QGroundControl needed).
//
// Spins up the bridge + a "fake GCS" UDP endpoint and verifies that injected HILS
// sensor faults (arriving in telemetry.faults) surface to the GCS:
//   1. SYS_STATUS streams at ~1 Hz; with no fault all sensors are healthy.
//   2. A GPS fault clears the GPS health bit in SYS_STATUS …
//   3. … and fires a STATUSTEXT naming the sensor + fault type.
//   4. Clearing the fault restores health and fires a "cleared" STATUSTEXT.
//
// Run: `node tests/gcs-faults-check.mjs`
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decode } from '../bridge/mavlink.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QGC_PORT = 14550, BRIDGE_RX = 14555, HTTP = 8765;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SYS_STATUS = 1, STATUSTEXT = 253;
const GPS_BIT = 1 << 5;

const rx = [];
const sysStatus = () => rx.filter((p) => p.msgId === SYS_STATUS).map((p) => {
  const dv = new DataView(p.payload.buffer, p.payload.byteOffset, p.payload.byteLength);
  return { present: dv.getUint32(0, true), enabled: dv.getUint32(4, true), health: dv.getUint32(8, true) };
});
const statusTexts = () => rx.filter((p) => p.msgId === STATUSTEXT).map((p) => {
  let s = ''; for (let i = 1; i < p.payload.length; i++) { const c = p.payload[i]; if (!c) break; s += String.fromCharCode(c); }
  return { severity: p.payload[0], text: s };
});
const postTelem = (extra) => fetch(`http://localhost:${HTTP}/telemetry`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ x: 0, z: 0, y: 0, altitude: 100, headingDeg: 0, mode: 'MANUAL', armed: true, ...extra }),
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

  // 1) SYS_STATUS streaming, all healthy with no fault
  await postTelem({ faults: {} });
  await sleep(1300);
  let ss = sysStatus();
  check('SYS_STATUS (1) streaming', ss.length > 0, `(${ss.length})`);
  const last = ss[ss.length - 1];
  check('GPS healthy when no fault', last && (last.health & GPS_BIT) !== 0,
    last ? `health=0x${last.health.toString(16)}` : '');
  check('GPS present+enabled', last && (last.present & GPS_BIT) && (last.enabled & GPS_BIT));

  // 2+3) inject a GPS fault → health bit clears + STATUSTEXT
  rx.length = 0;
  await postTelem({ faults: { gpsX: 'frozen' } });
  await sleep(1300);
  const faulted = sysStatus();
  const fl = faulted[faulted.length - 1];
  check('GPS health bit CLEARS under fault', fl && (fl.health & GPS_BIT) === 0,
    fl ? `health=0x${fl.health.toString(16)}` : '(no SYS_STATUS)');
  const txt = statusTexts();
  check('STATUSTEXT fires naming the sensor', txt.some((t) => /GPS/i.test(t.text) && /FROZEN/i.test(t.text)),
    txt.length ? `"${txt[txt.length - 1].text}"` : '(none)');
  check('STATUSTEXT severity = WARNING(4)', txt.some((t) => /GPS/i.test(t.text) && t.severity === 4));

  // 4) clear the fault → health restored + "cleared" STATUSTEXT
  rx.length = 0;
  await postTelem({ faults: {} });
  await sleep(1300);
  const cleared = sysStatus();
  const cl = cleared[cleared.length - 1];
  check('GPS health RESTORED after clearing', cl && (cl.health & GPS_BIT) !== 0,
    cl ? `health=0x${cl.health.toString(16)}` : '');
  check('STATUSTEXT "cleared" fires', statusTexts().some((t) => /GPS/i.test(t.text) && /cleared/i.test(t.text)));

  sock.close();
} finally {
  if (bridge) bridge.kill('SIGKILL');
}

const passed = results.filter(Boolean).length;
const ok = passed === results.length && results.length > 0;
console.log(`\ngcs-faults-check: ${ok ? 'PASS' : 'FAIL'} — ${passed}/${results.length}`);
process.exit(ok ? 0 : 1);
