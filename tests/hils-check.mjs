// Headless HILS fault-injection check (manual; run via Chrome CDP).
// Proves the M9 I/O layer end-to-end: (1) a healthy actuator follows the stick,
// a STUCK actuator does not; (2) a sensor BIAS fault makes the measured value
// diverge from truth. Exit 0 = HILS layer works, 1 = failed.
//
// Usage: node tests/hils-check.mjs <pageUrl> <cdpPort>

const pageUrl = process.argv[2] || 'http://localhost:8123/index.html';
const cdpPort = process.argv[3] || '9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 20; i++) {
  try {
    const list = await (await fetch(`http://localhost:${cdpPort}/json`)).json();
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (target) break;
  } catch {}
  await sleep(250);
}
if (!target) { console.error('CDP: no page target'); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result && r.result.value;
};
const keyEv = (type, key) =>
  send('Runtime.evaluate', { expression: `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { key: ${JSON.stringify(key)} }))` });

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000);

const fails = [];

// --- 0. HILS tap present? ---
const hasTap = await evalJs(`!!(window.__hils && window.injectFault && window.__hils.measured)`);
if (!hasTap) { console.error('window.__hils / injectFault missing'); process.exit(1); }

// --- 1. Actuator: healthy follows the stick ---
await keyEv('keydown', 'w');
await sleep(800);
const elevHealthy = await evalJs(`window.__hils.actuators.elevator`);
await keyEv('keyup', 'w');
await sleep(700); // surface returns toward neutral
console.log('healthy elevator under +pitch:', elevHealthy);
if (!(elevHealthy > 0.1)) fails.push(`healthy actuator did not follow command: ${elevHealthy}`);

// --- 2. Actuator: STUCK fault freezes the surface ---
await evalJs(`window.injectFault('elevator', { type: 'stuck' })`);
const elevBeforeStuck = await evalJs(`window.__hils.actuators.elevator`);
await keyEv('keydown', 'w');
await sleep(1000);
const elevStuck = await evalJs(`window.__hils.actuators.elevator`);
await keyEv('keyup', 'w');
console.log('stuck elevator: before', elevBeforeStuck, '→ after +pitch', elevStuck);
if (Math.abs(elevStuck - elevBeforeStuck) > 0.03) fails.push(`stuck actuator still moved: ${elevBeforeStuck} → ${elevStuck}`);

// --- 3. Sensor: BIAS fault makes measured diverge from truth ---
await evalJs(`window.injectFault('altitude', { type: 'bias', value: 50 })`);
await sleep(1600); // let the lagged baro settle to truth + bias
const alt = await evalJs(`(function(){ const m = window.__hils.measured; return { measured: m.altitude, truth: m._truth.altitude }; })()`);
const diff = alt.measured - alt.truth;
console.log('altitude sensor: measured', alt.measured.toFixed(1), 'vs truth', alt.truth.toFixed(1), '→ Δ', diff.toFixed(1));
if (Math.abs(diff - 50) > 4) fails.push(`altitude bias fault not reflected: Δ=${diff} (expected ≈50)`);

await evalJs(`window.clearFaults()`);
ws.close();

if (fails.length) {
  console.log(`hils-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('hils-check: PASS — actuator follows/stuck, sensor bias diverges from truth');
process.exit(0);
