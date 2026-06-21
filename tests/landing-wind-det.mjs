// Deterministic headless autoland-in-wind check (manual; run via Chrome CDP).
// Unlike landing-wind-check, this drives the sim with window.__advance (fixed dt,
// no rendering) so the run is fully REPRODUCIBLE — the same code always produces
// the same trajectory, which is what makes the wind/gust autoland tunable and
// verifiable. Injects a steady crosswind + gust and verifies a SAFE landing that
// holds the runway centreline on short final.
//
// Usage: node tests/landing-wind-det.mjs <pageUrl> <cdpPort> [navSource] [east] [gust]

const pageUrl = process.argv[2] || 'http://localhost:8123/index.html';
const cdpPort = process.argv[3] || '9222';
const navSource = process.argv[4] || 'truth';
const east = Number(process.argv[5] ?? 6);   // m/s steady crosswind from the west (+x)
const gust = Number(process.argv[6] ?? 3);   // m/s gust RMS
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

// Advance the sim deterministically by `secs` and return the new state snapshot.
// Reads sim state directly (not the HUD) because __advance does not render.
const fullExpr = (secs) => `(function(){
  const r = window.__advance(${secs});
  const h = window.__hils;
  return {
    status: r.status, phase: h.auto.phase, src: h.navSource,
    alt: +(h.pos.y - 0.8).toFixed(1),
    spd: +h.vel.spd.toFixed(1),
    vsi: +h.vel.y.toFixed(1),
    x: +h.pos.x.toFixed(1), wx: +h.wind.x.toFixed(1), wy: +h.wind.y.toFixed(1), wz: +h.wind.z.toFixed(1),
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000);
// Freeze the RAF loop + reset to a known state, THEN configure — so the run is
// fully deterministic (the live loop can't double-step or pre-advance the sim).
await ev(`window.__resetForTest()`);
await ev(`window.setNavSource('${navSource}')`);
await ev(`window.setWind(${east}, 0, ${gust})`);
await ev(`window.loadDemoMission()`);

const fails = [];
let sawApproach = false, sawFlare = false, landed = false, crashed = false;
let minAlt = 999, last = null, maxAbsX = 0, finalAbsX = 0, gustSeen = 0, t = 0;
const STEP = 2;                        // sim seconds per advance
for (let i = 0; i < 160; i++) {        // up to 320 s of sim, runs in ~seconds
  const s = await ev(fullExpr(STEP)); last = s; t += STEP;
  if (s.phase === 'APPROACH') sawApproach = true;
  if (s.phase === 'FLARE') sawFlare = true;
  if (s.alt < minAlt) minAlt = s.alt;
  if (sawApproach && s.alt > 1) maxAbsX = Math.max(maxAbsX, Math.abs(s.x));
  if (sawApproach && s.alt > 1 && s.alt < 50) finalAbsX = Math.max(finalAbsX, Math.abs(s.x));
  gustSeen = Math.max(gustSeen, Math.abs(s.wx - east), Math.abs(s.wz), Math.abs(s.wy));
  if (s.status === 'CRASH') { crashed = true; break; }
  if (s.phase === 'DONE') { landed = true; break; }
  if (i % 4 === 0) console.log(`t≈${t}s ${s.phase} alt=${s.alt} spd=${s.spd} vsi=${s.vsi} x=${s.x} w=(${s.wx},${s.wy},${s.wz}) ${s.status}`);
}
console.log('final:', last, '| approach=', sawApproach, 'flare=', sawFlare, 'landed=', landed, 'minAlt=', minAlt, 'maxAbsX=', maxAbsX.toFixed(1), 'finalAbsX=', finalAbsX.toFixed(1), 'gustSeen=', gustSeen.toFixed(1));
ws.close();

if (crashed) fails.push('aircraft crashed on landing');
if (!sawApproach) fails.push('never reached the APPROACH phase');
if (!landed) fails.push(`did not complete the landing (final phase ${last && last.phase})`);
if (minAlt > 3) fails.push(`never descended to the ground (minAlt=${minAlt})`);
if (landed && last.spd > 40) fails.push(`did not slow on rollout (spd=${last.spd})`);
if (gustSeen < 0.5) fails.push(`wind/gust was not active (gustSeen=${gustSeen.toFixed(1)})`);
// The aircraft must complete the landing in the crosswind+gust and track the runway
// centreline on short final. The M23 yaw damper removed the old roll-overshoot limit
// cycle, so short-final tracking is now ~90-100 m (was ±150-320 m).
if (finalAbsX > 140) fails.push(`not tracking the centreline on short final (finalAbsX=${finalAbsX.toFixed(1)} m)`);
if (maxAbsX > 170) fails.push(`excessive lateral excursion (maxAbsX=${maxAbsX.toFixed(1)} m)`);

if (fails.length) {
  console.log(`landing-wind-det: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`landing-wind-det: PASS — landed in ${east} m/s crosswind + ${gust} m/s gust on '${last.src}' nav (short-final centreline ≤ ${finalAbsX.toFixed(0)} m, rolled to ${last.spd} m/s)`);
process.exit(0);
