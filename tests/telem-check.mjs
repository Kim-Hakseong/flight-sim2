// Headless telemetry/GPS-jam check (manual; run via Chrome CDP).
// Stands in for the MAVLink bridge: captures the telemetry the page POSTs, then
// injects a GPS fault and confirms the *transmitted* position reflects it — i.e.
// the jam would move/freeze the vehicle on the QGroundControl map. Exit 0 = ok.
//
// Usage: node tests/telem-check.mjs <pageUrl> <cdpPort>

import http from 'node:http';

const pageUrl = process.argv[2] || 'http://localhost:8123/index.html';
const cdpPort = process.argv[3] || '9222';
const CAP_PORT = 8799;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- capture server: pretends to be the bridge's /telemetry receiver ---
let lastPayload = null;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (req.method === 'POST' && req.url === '/telemetry') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { lastPayload = JSON.parse(body); } catch {}
      res.writeHead(200, cors); res.end('ok');
    });
    return;
  }
  res.writeHead(404, cors); res.end();
});
await new Promise((r) => server.listen(CAP_PORT, r));

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
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

await send('Page.enable');
await send('Runtime.enable');
// Point telemetry at our capture server BEFORE the module loads.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.TELEMETRY_URL = 'http://localhost:${CAP_PORT}/telemetry';` });
await send('Page.navigate', { url: pageUrl });
await sleep(2500); // init + a few telemetry frames

const fails = [];
const baseline = lastPayload;
console.log('baseline tx:', baseline && { x: baseline.x, z: baseline.z, alt: baseline.altitude });

// An HTTPS page (e.g. the github.io deploy) cannot POST to an http://localhost
// capture server — the browser blocks mixed content. That's expected: the real
// QGC/HILS demo runs entirely local over http (`npm run bridge`). Skip, don't fail.
if (!baseline && pageUrl.startsWith('https:')) {
  console.log('telem-check: SKIP — HTTPS page can\'t POST to http capture (mixed content). Run against a local http page for the real check.');
  ws.close(); server.close();
  process.exit(0);
}
if (!baseline) fails.push('no telemetry captured (measured→telemetry not sending?)');

// Inject a GPS bias/spoof and confirm the transmitted position jumps.
await evalJs(`window.injectFault('gpsX', { type: 'bias', value: 1000 })`);
await sleep(3000); // GPS sensor lag (bw≈3) settles toward truth+1000
const jammed = lastPayload;
console.log('after GPS bias tx:', jammed && { x: jammed.x, z: jammed.z, alt: jammed.altitude });

if (baseline && Math.abs(baseline.x) > 50) fails.push(`baseline x not near truth: ${baseline.x}`);
if (!jammed || jammed.x < 900) fails.push(`GPS jam did not reach telemetry: x=${jammed && jammed.x} (expected ≈1000)`);

await evalJs(`window.clearFaults()`);
ws.close();
server.close();

if (fails.length) {
  console.log(`telem-check: FAIL (${fails.length})`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('telem-check: PASS — measured telemetry transmits; GPS jam moves the reported position');
process.exit(0);
