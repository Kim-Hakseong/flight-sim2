// Mission link: subscribes to the bridge's SSE channel so the autopilot
// learns about mission uploads and mode changes from QGC.

import { setMission, startMission, abort } from './autopilot.js';
import { attach as attachHitl } from './hitl.js';

const BRIDGE_PORT_DEFAULT = 8765;

let online = false;
let es = null;

// GCS nav-command handlers (M3): main.js registers these (it needs HOME + the live
// position to build the missions). Attached on the SAME EventSource as the proven
// mission/mode listeners so they fire reliably.
let nav = {};
export function setNavHandlers(handlers) { nav = handlers || {}; }

// GCS parameter set (M4): main.js registers a handler that applies (id,value) to
// the autopilot gains / sensor noise. Set on the same EventSource as the rest.
let onParam = null;
export function setParamHandler(fn) { onParam = fn; }

export function isMissionLinkOnline() { return online; }
export function getEventSource() { return es; }

function resolveUrl() {
  if (typeof window !== 'undefined' && window.COMMANDS_URL) return window.COMMANDS_URL;
  if (typeof location !== 'undefined' &&
      (location.protocol === 'http:' || location.protocol === 'https:')) {
    if (location.port === String(BRIDGE_PORT_DEFAULT)) return '/commands';
    return `${location.protocol}//${location.hostname || 'localhost'}:${BRIDGE_PORT_DEFAULT}/commands`;
  }
  return `http://localhost:${BRIDGE_PORT_DEFAULT}/commands`;
}

// Nav commands are one-shot; the SSE link can drop and re-send (the bridge buffers
// the latest), so dedupe by the bridge's monotonic __seq — apply each command once.
let navSeq = 0;
function freshNav(d) { if (d && d.__seq) { if (d.__seq <= navSeq) return false; navSeq = d.__seq; } return true; }

export function connect(defaultHome) {
  if (typeof EventSource === 'undefined') return;
  const url = resolveUrl();
  try {
    es = new EventSource(url);
  } catch {
    return;
  }
  es.addEventListener('open', () => { online = true; });
  es.addEventListener('error', () => { online = false; });

  // HITL events flow on the same SSE stream — share the connection.
  attachHitl(es);

  es.addEventListener('mission', (e) => {
    try {
      const data = JSON.parse(e.data);
      setMission(data.items || [], data.home || defaultHome);
      console.log('[mission] uploaded:', (data.items || []).length, 'items');
    } catch {}
  });

  es.addEventListener('mission_start', () => {
    startMission();
    console.log('[mission] start');
  });

  es.addEventListener('mode', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.auto === false) abort();
    } catch {}
  });

  // GCS nav commands (M3) — delegate to main.js-registered builders. Deduped by
  // __seq so a re-send on reconnect (or the buffered re-send) applies only once.
  es.addEventListener('takeoff', (e) => {
    try { const d = JSON.parse(e.data); if (freshNav(d) && nav.takeoff) nav.takeoff(d.alt || 0); } catch {}
  });
  es.addEventListener('land', (e) => {
    try { const d = JSON.parse(e.data || '{}'); if (freshNav(d) && nav.land) nav.land(); } catch {}
  });
  es.addEventListener('rtl', (e) => {
    try { const d = JSON.parse(e.data || '{}'); if (freshNav(d) && nav.rtl) nav.rtl(); } catch {}
  });
  es.addEventListener('goto', (e) => {
    try { const d = JSON.parse(e.data); if (freshNav(d) && nav.goto) nav.goto(d.lat, d.lon, d.alt || 0); } catch {}
  });

  // GCS parameter set (M4). Idempotent (just assigns a gain), so no __seq dedupe
  // needed — the bridge re-sends overrides on reconnect to catch a late sim.
  es.addEventListener('param_set', (e) => {
    try { const d = JSON.parse(e.data); if (onParam && d && d.id) onParam(d.id, d.value); } catch {}
  });
}
