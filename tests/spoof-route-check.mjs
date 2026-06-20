// Headless GPS-spoof-resilience demo (manual; run via Chrome CDP).
// Flies the AUTO mission on sensor-fused 'estimated' nav, then injects a large
// GPS spoof mid-mission. With FDE (M13) the gated Kalman rejects the jump, so the
// nav estimate keeps tracking truth and the autopilot stays on its route and keeps
// reaching waypoints — instead of being dragged off to the spoofed position.
// Exit 0 = route held through the spoof.
//
// Usage: node tests/spoof-route-check.mjs <pageUrl> <cdpPort>

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
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;

const stateExpr = `(function(){
  const h = window.__hils; const t = h.measured && h.measured._truth;
  const est = h.nav && h.nav.estimated;
  return {
    seq: h.auto.seq, phase: h.auto.phase, src: h.navSource, degraded: h.navDegraded,
    truthX: t && t.gpsX, estX: est && est.x,
    alt: Number(document.getElementById('v-alt').textContent),
    st: document.getElementById('v-status').textContent,
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000);
await ev(`window.loadDemoMission()`);

const fails = [];

// 1. Fly until established in cruise (NAV, climbed) on estimated nav.
let s;
for (let i = 0; i < 40; i++) {
  s = await ev(stateExpr);
  if (s.phase === 'NAV' && s.alt > 130) break;
  await sleep(1500);
}
console.log('established cruise:', s);
if (s.src !== 'estimated') fails.push(`expected estimated nav, got '${s.src}'`);
const seqAtSpoof = s.seq;

// 2. Inject a large GPS spoof (a 2 km jump east).
await ev(`window.injectFault('gpsX', { type: 'bias', value: 2000 })`);
console.log('--- injected GPS spoof: gpsX bias +2000 m ---');

// 3. Keep flying; the spoof must NOT capture the estimate, NAV DEGRADED must
// raise, and the mission must keep advancing waypoints.
let sawDegraded = false, maxSeq = seqAtSpoof, crashed = false, maxEstErr = 0, last = s;
for (let i = 0; i < 70; i++) {                // ~105 s after the spoof
  s = await ev(stateExpr); last = s;
  if (s.degraded) sawDegraded = true;
  maxSeq = Math.max(maxSeq, s.seq);
  if (s.estX != null && s.truthX != null) maxEstErr = Math.max(maxEstErr, Math.abs(s.estX - s.truthX));
  if (s.st === 'CRASH') { crashed = true; break; }
  if (i % 5 === 0) console.log(`+${(i * 1.5).toFixed(0)}s seq=${s.seq} estErr=${s.estX != null ? (s.estX - s.truthX).toFixed(0) : '?'} degraded=${s.degraded} st=${s.st}`);
  if (s.phase === 'DONE') break;
  await sleep(1500);
}
console.log('final:', last, '| sawDegraded=', sawDegraded, 'maxSeq=', maxSeq, 'maxEstErr=', maxEstErr.toFixed(0));
await ev(`window.clearFaults()`);
ws.close();

if (!sawDegraded) fails.push('FDE never raised NAV DEGRADED on the spoof');
if (maxEstErr > 300) fails.push(`spoof captured the estimate: |est−truth| reached ${maxEstErr.toFixed(0)} m (FDE should hold it ≈truth)`);
if (maxSeq <= seqAtSpoof) fails.push(`mission did not progress after the spoof (seq stuck at ${seqAtSpoof})`);
if (crashed) fails.push('aircraft crashed after the spoof');

if (fails.length) {
  console.log(`spoof-route-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`spoof-route-check: PASS — FDE rejected the GPS spoof (est held ≈truth, |err|≤${maxEstErr.toFixed(0)}m), NAV DEGRADED raised, AUTO kept its route to waypoint ${maxSeq}`);
process.exit(0);
