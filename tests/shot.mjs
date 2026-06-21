// Quick screenshot harness (manual): loads the page, optionally selects a model
// and frames an external view of the aircraft, then writes a PNG.
// Usage: node tests/shot.mjs <url> <cdpPort> <outPng> [modelKey]
const url = process.argv[2], port = process.argv[3] || '9222', out = process.argv[4] || '/tmp/shot.png';
const model = process.argv[5] || '';
const fs = await import('node:fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 20; i++) { try { const l = await (await fetch(`http://localhost:${port}/json`)).json(); target = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (target) break; } catch {} await sleep(250); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url }); await sleep(2500);
if (model) { await ev(`window.setAircraftModel('${model}')`); await sleep(800); }
await ev(`window.__camMode('external')`);
await sleep(1500);  // let the external orbit rotate to a 3/4 view
const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log('wrote', out);
ws.close(); process.exit(0);
