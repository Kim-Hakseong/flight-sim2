// Fine-grained diagnostic for the crosswind approach departure (M22, throwaway).
// Steps 1 s at a time and prints attitude/AoA/airspeed so the stall mechanism is
// visible. Usage: node tests/wind-diag.mjs <pageUrl> <cdpPort> [east] [gust]
const pageUrl = process.argv[2], cdpPort = process.argv[3] || '9222';
const east = Number(process.argv[4] ?? 5), gust = Number(process.argv[5] ?? 2.5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 20; i++) { try { const l = await (await fetch(`http://localhost:${cdpPort}/json`)).json(); target = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (target) break; } catch {} await sleep(250); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: pageUrl }); await sleep(2000);
await ev(`window.__resetForTest()`); await ev(`window.setNavSource('truth')`);
await ev(`window.setWind(${east},0,${gust})`); await ev(`window.loadDemoMission()`);
const expr = `(function(){ const r=window.__advance(1); const h=window.__hils; const d=h.diag;
  return {st:r.status, ph:h.auto.phase, alt:+(h.pos.y-0.8).toFixed(1), x:+h.pos.x.toFixed(0), gs:+h.vel.spd.toFixed(1),
    as:d.airspd, aoa:d.aoa, pit:d.pitch, bnk:d.bank, hdg:d.hdg, beta:d.beta, ail:d.ail, rud:d.rud, rr:d.rollrate, yr:d.yawrate, thr:d.thr, fl:d.flaps, wx:+h.wind.x.toFixed(1), wz:+h.wind.z.toFixed(1)};})()`;
let printing = false;
for (let t = 0; t < 200; t++) {
  const s = await ev(expr);
  if (s.ph === 'APPROACH' || process.env.ALLPH) printing = true;
  if (printing) console.log(`t${t} ${s.ph} alt=${s.alt} x=${s.x} gs=${s.gs} AS=${s.as} aoa=${s.aoa} pit=${s.pit} bnk=${s.bnk} hdg=${s.hdg} beta=${s.beta} ail=${s.ail} rud=${s.rud} rr=${s.rr} yr=${s.yr} fl=${s.fl} w=(${s.wx},${s.wz}) ${s.st}`);
  if (s.st === 'CRASH' || s.ph === 'DONE') { console.log('END:', s.ph, s.st); break; }
}
ws.close(); process.exit(0);
