// Headless behavioral flight check (manual; run via Chrome CDP).
// Injects throttle + pitch input and reads the HUD to confirm the moment-based
// 6-DOF model actually flies: accelerates, rotates, climbs — no NaN, no crash.
// Exit 0 = flew, 1 = failed.
//
// Usage: node tests/fly-check.mjs <pageUrl> <cdpPort>

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

// Dispatch a synthetic KeyboardEvent on window — controls.js listens there and
// reads e.key, so this reaches the held-keys set reliably in headless (CDP
// Input.dispatchKeyEvent needs a focused element that headless lacks).
const keyEv = (type, key) =>
  send('Runtime.evaluate', {
    expression: `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { key: ${JSON.stringify(key)}, bubbles: true }))`,
  });
const hud = async () => {
  const expr = `JSON.stringify({
    speed: document.getElementById('v-speed')?.textContent,
    alt:   document.getElementById('v-alt')?.textContent,
    thr:   document.getElementById('v-thr')?.textContent,
    status:document.getElementById('v-status')?.textContent,
    pitch: document.getElementById('v-pitch')?.textContent,
    g:     document.getElementById('v-g')?.textContent,
  })`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return JSON.parse(r.result.value);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000); // init + first frames

const t0 = await hud();
console.log('t0 (start):     ', t0);

const num = (s) => Number(String(s).replace('%', ''));

await keyEv('keydown', 'ArrowUp');           // throttle up, held
await sleep(13000);                          // accelerate to rotation speed
const tRoll = await hud();
console.log('t≈13s (rolling):', tRoll);

// Closed-loop rotation like a pilot: pulse elevator to hold pitch near ~8°,
// reading the HUD between pulses so we don't over-rotate into a stall.
let peakAlt = num(tRoll.alt);
for (let i = 0; i < 22; i++) {
  const h = await hud();
  peakAlt = Math.max(peakAlt, num(h.alt));
  if (num(h.pitch) < 8) {
    await keyEv('keydown', 'w');
    await sleep(110);
    await keyEv('keyup', 'w');
  }
  await sleep(300);
}
const tClimb = await hud();
peakAlt = Math.max(peakAlt, num(tClimb.alt));
console.log('t≈22s (climb):  ', tClimb, '| peakAlt=', peakAlt);

await keyEv('keyup', 'w');
await keyEv('keyup', 'ArrowUp');
ws.close();

// ---- assertions ----
const fails = [];
const finite = (label, v) => { if (!Number.isFinite(num(v))) fails.push(`${label} not finite: ${v}`); };

finite('start speed', t0.speed); finite('start alt', t0.alt);
finite('climb speed', tClimb.speed); finite('climb alt', tClimb.alt);
finite('climb g', tClimb.g); finite('climb pitch', tClimb.pitch);

if (num(tRoll.thr) < 90) fails.push(`throttle did not ramp (input not received?): ${tRoll.thr}`);
if (num(tRoll.speed) <= num(t0.speed) + 10) fails.push(`did not accelerate: ${t0.speed} → ${tRoll.speed}`);
if (peakAlt <= num(t0.alt) + 3) fails.push(`did not climb: peakAlt=${peakAlt} (pitch authority / lift?)`);
if (tClimb.status === 'CRASH') fails.push('ended in CRASH');

if (fails.length) {
  console.log(`fly-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('fly-check: PASS — accelerated, rotated, climbed, no NaN/crash');
process.exit(0);
