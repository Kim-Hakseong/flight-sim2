// HITL (hardware/software-in-the-loop) link.
//
// External producer (LabVIEW / FPGA / Python sim / another simulator) POSTs
// state to bridge `/hitl/state`. Bridge re-broadcasts it as an SSE event on
// the existing `/commands` channel. This module subscribes and exposes the
// latest received state. main.js, when HITL is engaged, replaces local
// physics integration with the received pose so the browser becomes a pure
// 3D visualizer for whatever the external system is computing.
//
// Expected JSON payload (fields all optional except position):
//   { t, x, y, z,
//     qx, qy, qz, qw,           // body orientation quaternion (preferred)
//     yawRad, pitchRad, rollRad, // euler fallback if quaternion absent
//     vx, vy, vz,                // optional velocity (for HUD)
//     speed, altitude,
//     throttle01,                // 0..1, drives prop spin + exhaust
//   }

const BRIDGE_PORT_DEFAULT = 8765;

let latest = null;
let lastUpdateMs = 0;
let connected = false;

export function isLinked() { return connected; }
export function isFresh(ms = 1500) { return latest != null && (Date.now() - lastUpdateMs) < ms; }
export function getLatest() { return latest; }

function resolveCommandsUrl() {
  if (typeof window !== 'undefined' && window.COMMANDS_URL) return window.COMMANDS_URL;
  if (typeof location !== 'undefined' &&
      (location.protocol === 'http:' || location.protocol === 'https:')) {
    if (location.port === String(BRIDGE_PORT_DEFAULT)) return '/commands';
    return `${location.protocol}//${location.hostname || 'localhost'}:${BRIDGE_PORT_DEFAULT}/commands`;
  }
  return `http://localhost:${BRIDGE_PORT_DEFAULT}/commands`;
}

/**
 * Attach a HITL listener to the existing SSE source so we don't open two
 * EventSources. Pass in the same EventSource that missionLink uses.
 */
export function attach(es) {
  if (!es) return;
  es.addEventListener('open',  () => { connected = true; });
  es.addEventListener('error', () => { connected = false; });
  es.addEventListener('hitl_state', (e) => {
    try {
      latest = JSON.parse(e.data);
      lastUpdateMs = Date.now();
    } catch { /* ignore malformed */ }
  });
}

/** Standalone connect (when missionLink isn't already opening a stream). */
export function connect() {
  if (typeof EventSource === 'undefined') return null;
  try {
    const es = new EventSource(resolveCommandsUrl());
    attach(es);
    return es;
  } catch { return null; }
}
