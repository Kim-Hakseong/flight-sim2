// Headless autoland-in-wind check (manual; run via Chrome CDP). Same as
// landing-check, but injects a steady crosswind + gusts before the approach and
// verifies the autopilot still flies a SAFE landing (approach → flare →
// touchdown → rollout, no crash) AND holds the runway centerline (x≈0) despite
// being pushed sideways by the wind.
//
// Usage: node tests/landing-wind-check.mjs <pageUrl> <cdpPort> [navSource] [east] [gust]

const pageUrl = process.argv[2] || 'http://localhost:8123/index.html';
const cdpPort = process.argv[3] || '9222';
const navSource = process.argv[4] || 'truth';
const east = process.argv[5] || '8';   // m/s steady crosswind from the west (+x)
const gust = process.argv[6] || '4';   // m/s gust RMS
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
    x: h.pos.x, wx: h.wind.x, wz: h.wind.z,
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000);
await ev(`window.setNavSource('${navSource}')`);
await ev(`window.setWind(${east}, 0, ${gust})`);
await ev(`window.loadDemoMission()`);

const fails = [];
let sawApproach = false, sawFlare = false, landed = false, crashed = false;
let minAlt = 999, last = null, maxAbsX = 0, finalAbsX = 0, gustSeen = 0;
for (let i = 0; i < 160; i++) {      // up to ~240 s
  const s = await ev(stateExpr); last = s;
  if (s.phase === 'APPROACH') sawApproach = true;
  if (s.phase === 'FLARE') sawFlare = true;
  if (s.alt < minAlt) minAlt = s.alt;
  // track lateral excursion only while airborne & approaching (not the long taxi-out)
  if (sawApproach && s.alt > 1) maxAbsX = Math.max(maxAbsX, Math.abs(s.x));
  // short final (below 50 m AGL): this is what must be on the runway — the
  // localiser must be captured by here, regardless of the capture transient above.
  if (sawApproach && s.alt > 1 && s.alt < 50) finalAbsX = Math.max(finalAbsX, Math.abs(s.x));
  gustSeen = Math.max(gustSeen, Math.abs(s.wx - Number(east)), Math.abs(s.wz));
  if (s.st === 'CRASH') { crashed = true; break; }
  if (s.phase === 'DONE') { landed = true; break; }
  if (i % 5 === 0) console.log(`t≈${(2 + i * 1.5).toFixed(0)}s ${s.phase} alt=${s.alt} spd=${s.spd} vsi=${s.vsi} x=${s.x.toFixed(1)} w=(${s.wx.toFixed(1)},${s.wz.toFixed(1)}) ${s.st}`);
  await sleep(1500);
}
console.log('final:', last, '| approach=', sawApproach, 'flare=', sawFlare, 'landed=', landed, 'minAlt=', minAlt, 'maxAbsX=', maxAbsX.toFixed(1), 'finalAbsX=', finalAbsX.toFixed(1), 'gustSeen=', gustSeen.toFixed(1));
ws.close();

if (crashed) fails.push('aircraft crashed on landing');
if (!sawApproach) fails.push('never reached the APPROACH phase');
if (!landed) fails.push(`did not complete the landing (final phase ${last && last.phase})`);
if (minAlt > 3) fails.push(`never descended to the ground (minAlt=${minAlt})`);
if (landed && last.spd > 40) fails.push(`did not slow on rollout (spd=${last.spd})`);
if (gustSeen < 0.5) fails.push(`wind/gust was not active (gustSeen=${gustSeen.toFixed(1)})`);
// localiser must be captured by short final; the capture transient up high is allowed
// a looser bound (it's recoverable airspace), short final must be near the centreline.
if (finalAbsX > 90) fails.push(`not on the centerline at short final (finalAbsX=${finalAbsX.toFixed(1)} m)`);
if (maxAbsX > 400) fails.push(`excessive capture excursion (maxAbsX=${maxAbsX.toFixed(1)} m)`);

if (fails.length) {
  console.log(`landing-wind-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`landing-wind-check: PASS — landed in ${east} m/s crosswind + ${gust} m/s gust on '${last.src}' nav (held centerline to ${maxAbsX.toFixed(0)} m, rolled to ${last.spd} m/s)`);
process.exit(0);
