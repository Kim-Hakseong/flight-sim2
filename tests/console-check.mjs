// Headless console-error check (not a unit test; run manually via Chrome CDP).
// Loads the live page, drives a few seconds of the loop, and reports any
// runtime exception or console.error. Exit 0 = clean, 1 = errors found.
//
// Usage: node tests/console-check.mjs <pageUrl> <cdpPort>

const pageUrl = process.argv[2] || 'http://localhost:8123/index.html';
const cdpPort = process.argv[3] || '9222';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Expected-benign noise when running standalone (no MAVLink bridge, no favicon).
// These are fail-silent by design (telemetry.js / missionLink.js) — not app bugs.
const IGNORE = [/:8765\//, /favicon\.ico/];
const ignored = (s) => IGNORE.some((re) => re.test(s));

// Find a debuggable target.
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
const errors = [];
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await new Promise((res) => { ws.onopen = res; });

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push('EXCEPTION: ' + (d.exception?.description || d.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG: ' + m.params.entry.text + (m.params.entry.url ? ' [' + m.params.entry.url + ']' : ''));
  }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    errors.push(`NET ${m.params.response.status}: ${m.params.response.url}`);
  }
};

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(4000); // let the render/physics loop run

const real = errors.filter((e) => !ignored(e));
const skipped = errors.length - real.length;
console.log(`console-check: ${real.length} app error(s) at ${pageUrl} (${skipped} expected-benign ignored)`);
for (const e of real) console.log('  - ' + e);
ws.close();
process.exit(real.length === 0 ? 0 : 1);
