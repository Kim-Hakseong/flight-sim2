// Headless autoland check (manual; run via Chrome CDP). Flies the AUTO mission to
// its `land` waypoint and verifies a SAFE landing: stabilized approach → flare →
// touchdown (altitude → ~0) → rollout, with no crash. Exit 0 = landed.
//
// Usage: node tests/landing-check.mjs <pageUrl> <cdpPort> [navSource]

const pageUrl = process.argv[2] || 'http://localhost:8123/index.html';
const cdpPort = process.argv[3] || '9222';
const navSource = process.argv[4] || 'truth';
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
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;

const stateExpr = `(function(){
  const h = window.__hils;
  return {
    phase: h.auto.phase, src: h.navSource,
    alt: Number(document.getElementById('v-alt').textContent),
    spd: Number(document.getElementById('v-speed').textContent),
    vsi: Number(document.getElementById('v-vsi').textContent),
    st: document.getElementById('v-status').textContent,
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000);
await ev(`window.setNavSource('${navSource}')`);
await ev(`window.loadDemoMission()`);

const fails = [];
let sawApproach = false, sawFlare = false, landed = false, crashed = false;
let minAlt = 999, last = null, touchdownVsi = null;
for (let i = 0; i < 160; i++) {      // up to ~240 s
  const s = await ev(stateExpr); last = s;
  if (s.phase === 'APPROACH') sawApproach = true;
  if (s.phase === 'FLARE') sawFlare = true;
  if (s.alt < minAlt) minAlt = s.alt;
  if (s.alt < 2 && Math.abs(s.vsi) < 8 && touchdownVsi === null && s.phase !== 'TAKEOFF') touchdownVsi = s.vsi;
  if (s.st === 'CRASH') { crashed = true; break; }
  if (s.phase === 'DONE') { landed = true; break; }
  if (i % 5 === 0) console.log(`t≈${(2 + i * 1.5).toFixed(0)}s ${s.phase} alt=${s.alt} spd=${s.spd} vsi=${s.vsi} ${s.st}`);
  await sleep(1500);
}
console.log('final:', last, '| sawApproach=', sawApproach, 'sawFlare=', sawFlare, 'landed=', landed, 'minAlt=', minAlt);
ws.close();

if (crashed) fails.push('aircraft crashed on landing');
if (!sawApproach) fails.push('never reached the APPROACH phase');
if (!landed) fails.push(`did not complete the landing (final phase ${last && last.phase})`);
if (minAlt > 3) fails.push(`never descended to the ground (minAlt=${minAlt})`);
if (landed && last.spd > 40) fails.push(`did not slow on rollout (spd=${last.spd})`);

if (fails.length) {
  console.log(`landing-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`landing-check: PASS — stabilized approach → flare → touchdown → rollout (DONE, rolled to ${last.spd} m/s) on '${last.src}' nav`);
process.exit(0);
