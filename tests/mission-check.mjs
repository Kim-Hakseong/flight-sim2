// Headless AUTO-mission regression (manual; run via Chrome CDP).
// Loads the built-in demo mission and confirms the autopilot — flying on the
// sensor-derived 'estimated' nav (M11) — takes off, climbs, navigates, and
// advances at least one waypoint without crashing. Exit 0 = flew the mission.
//
// Usage: node tests/mission-check.mjs <pageUrl> <cdpPort>

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
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000);

const stateExpr = `(function(){
  const h = window.__hils; const a = h && h.auto;
  return {
    active: a && a.active, phase: a && a.phase, seq: a && a.seq, len: a && a.len,
    src: h && h.navSource,
    alt: Number(document.getElementById('v-alt')?.textContent),
    spd: Number(document.getElementById('v-speed')?.textContent),
    status: document.getElementById('v-status')?.textContent,
  };
})()`;

await evalJs(`window.loadDemoMission()`);
const start = await evalJs(stateExpr);
console.log('mission loaded:', start);

const fails = [];
if (!start.active) fails.push('mission did not become active');
if (start.len < 3) fails.push(`expected ≥3 waypoints, got ${start.len}`);

let maxAlt = 0, maxSeq = 0, reachedNav = false, crashed = false, done = false, last = start;
for (let i = 0; i < 150; i++) {      // up to ~225 s — the full coordinated circuit
  const s = await evalJs(stateExpr);
  last = s;
  maxAlt = Math.max(maxAlt, s.alt || 0);
  maxSeq = Math.max(maxSeq, s.seq || 0);
  if (s.phase === 'NAV' || s.phase === 'DONE') reachedNav = true;
  if (s.status === 'CRASH') { crashed = true; break; }
  if (i % 4 === 0) console.log(`t≈${(2 + i * 1.5).toFixed(0)}s phase=${s.phase} seq=${s.seq}/${s.len} alt=${s.alt} spd=${s.spd} st=${s.status}`);
  if (s.phase === 'DONE') { done = true; break; }     // whole mission flown
  await sleep(1500);
}
console.log('final:', last, '| maxAlt=', maxAlt, 'maxSeq=', maxSeq, 'done=', done);
ws.close();

if (crashed) fails.push('aircraft crashed during the mission');
if (!reachedNav) fails.push(`autopilot never left TAKEOFF (phase=${last.phase})`);
if (maxAlt < 80) fails.push(`did not climb on AUTO (maxAlt=${maxAlt})`);
// Coordinated turns must navigate the circuit: reach the back half (≥3 of 4 WPs)
// or finish. maxSeq≤1 means it couldn't turn through the waypoints.
if (!done && maxSeq < 3) fails.push(`did not navigate the circuit (maxSeq=${maxSeq}, done=${done})`);

if (fails.length) {
  console.log(`mission-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`mission-check: PASS — AUTO flew coordinated turns through ${done ? 'the full circuit (DONE)' : `waypoint ${maxSeq}`}, climbed ${Math.round(maxAlt)}m, on '${last.src}' nav`);
process.exit(0);
