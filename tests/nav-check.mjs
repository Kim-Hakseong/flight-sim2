// Headless sensor-in-the-loop check (manual; run via Chrome CDP).
// Confirms the navigation the autopilot flies on is sensor-derived: (1) under
// nominal noise the Kalman estimate is smoother than the raw GPS (closer to
// truth); (2) a GPS spoof/bias drags the estimate away from truth — i.e. the
// autopilot is fooled, which is the HILS lesson. Exit 0 = ok.
//
// Usage: node tests/nav-check.mjs <pageUrl> <cdpPort>

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
await sleep(2500);

const sampleExpr = `(function(){
  const h = window.__hils; if(!h||!h.nav) return null;
  const t = h.measured && h.measured._truth; if(!t) return null;
  return { estX: h.nav.estimated.x, measX: h.nav.measured.x, truthX: t.gpsX, src: h.navSource };
})()`;

const fails = [];
await evalJs(`window.setNavSource('estimated')`); // opt into sensor-in-the-loop
const s0 = await evalJs(sampleExpr);
console.log('nav sample:', s0);
if (!s0) { console.error('window.__hils.nav missing'); process.exit(1); }
if (s0.src !== 'estimated') fails.push(`setNavSource('estimated') did not take, got '${s0.src}'`);

// --- 1. nominal: estimate smoother (closer to truth) than raw GPS ---
let estErr = 0, measErr = 0, n = 0;
for (let i = 0; i < 25; i++) {
  const s = await evalJs(sampleExpr);
  if (s) { estErr += Math.abs(s.estX - s.truthX); measErr += Math.abs(s.measX - s.truthX); n++; }
  await sleep(80);
}
estErr /= n; measErr /= n;
console.log(`nominal: mean|est-truth|=${estErr.toFixed(3)}  mean|meas-truth|=${measErr.toFixed(3)}`);
if (measErr > 0.3 && !(estErr < measErr)) fails.push(`estimator not smoothing: est ${estErr} vs raw ${measErr}`);

// --- 2. GPS spoof: bias drags the autopilot's estimate off truth ---
await evalJs(`window.injectFault('gpsX', { type: 'bias', value: 200 })`);
await sleep(4000); // GPS lag + KF settle
const spoofed = await evalJs(sampleExpr);
console.log('after GPS spoof:', spoofed);
if (!spoofed || spoofed.estX < 100) fails.push(`spoof did not fool the estimate: estX=${spoofed && spoofed.estX} (expected ≫ truth)`);
if (Math.abs(spoofed.truthX) > 50) fails.push(`truth unexpectedly moved: ${spoofed.truthX}`);

await evalJs(`window.clearFaults()`);
ws.close();

if (fails.length) {
  console.log(`nav-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('nav-check: PASS — estimator smooths nominal GPS; spoof fools the autopilot nav (truth unmoved)');
process.exit(0);
