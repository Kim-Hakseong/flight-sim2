// Mission link: subscribes to the bridge's SSE channel so the autopilot
// learns about mission uploads and mode changes from QGC.

import { setMission, startMission, abort } from './autopilot.js';
import { attach as attachHitl } from './hitl.js';

const BRIDGE_PORT_DEFAULT = 8765;

let online = false;
let es = null;

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
}
