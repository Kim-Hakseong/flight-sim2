// Quick screenshot harness (manual): loads the page, optionally selects a model
// and frames an external view of the aircraft, then writes a PNG.
// Usage: node tests/shot.mjs <url> <cdpPort> <outPng> [modelKey]
const url = process.argv[2], port = process.argv[3] || '9222', out = process.argv[4] || '/tmp/shot.png';
const model = process.argv[5] || '';
const mobile = process.argv[6] === 'mobile';
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
if (mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
} else {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
}
await send('Page.navigate', { url }); await sleep(2500);
if (process.env.MAP) {
  await ev(`(function(){try{sessionStorage.setItem('fs-map','${process.env.MAP}')}catch(e){}location.reload();})()`);
  await sleep(2800);
}
if (model) { await ev(`window.setAircraftModel('${model}')`); await sleep(800); }
if (process.env.SWAP) { await ev(`window.setMap('${process.env.SWAP}')`); await sleep(1200); } // live map swap
if (process.env.COND) { await ev(`window.setCondition('${process.env.COND}')`); await sleep(1000); } // time/weather
if (process.env.FLY) {
  // Real-time flight so the RAF loop keeps rendering (unlike __advance which freezes it).
  await ev(`window.setWind && window.setWind(4,0,2)`);
  await ev(`window.__camMode('${process.env.CAM || 'cockpit'}')`);
  await ev(`window.loadDemoMission()`);
  await sleep(Number(process.env.FLY) * 1000);
} else if (!url.includes('intro=0')) { /* keep intro visible */ } else { await ev(`window.__camMode('external')`); }
await sleep(800);
const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log('wrote', out);
ws.close(); process.exit(0);
