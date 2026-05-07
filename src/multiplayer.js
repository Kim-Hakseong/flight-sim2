// Multiplayer: bridge-relay model.
//   browser → POST /mp/state → bridge → SSE event 'mp_state' → all peers
// We send our pose at ~10 Hz, and render every other peer as a ghost mesh
// reusing the AI-traffic mini-aircraft visual.

const PEER_ID = (() => {
  // Stable per-tab id.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'peer-' + Math.random().toString(36).slice(2, 10);
})();

const SEND_PERIOD_MS = 100;          // 10 Hz outbound
const STALE_MS = 5000;
const BRIDGE_PORT_DEFAULT = 8765;

let active = false;
let lastSentAt = 0;
const peers = new Map();             // peerId → { state, lastUpdateMs, mesh }

export function isActive() { return active; }
export function getPeerId() { return PEER_ID; }
export function getPeerCount() { return peers.size; }
export function getPeers() { return peers; }

export function setActive(on) { active = !!on; }

function resolveStateUrl() {
  if (typeof location !== 'undefined' &&
      (location.protocol === 'http:' || location.protocol === 'https:')) {
    if (location.port === String(BRIDGE_PORT_DEFAULT)) return '/mp/state';
    return `${location.protocol}//${location.hostname || 'localhost'}:${BRIDGE_PORT_DEFAULT}/mp/state`;
  }
  return `http://localhost:${BRIDGE_PORT_DEFAULT}/mp/state`;
}

export function maybeSend(state, nowMs) {
  if (!active) return;
  if (nowMs - lastSentAt < SEND_PERIOD_MS) return;
  lastSentAt = nowMs;
  fetch(resolveStateUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ peerId: PEER_ID, ...state }),
    keepalive: true,
  }).catch(() => { /* fail-silent */ });
}

/** Subscribe to peer-state events on the existing SSE stream. */
export function attach(es) {
  if (!es) return;
  es.addEventListener('mp_state', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (!data.peerId || data.peerId === PEER_ID) return;
      const entry = peers.get(data.peerId) || { state: null, lastUpdateMs: 0, mesh: null };
      entry.state = data;
      entry.lastUpdateMs = Date.now();
      peers.set(data.peerId, entry);
    } catch { /* ignore */ }
  });
}

export function tickPeers(scene, ghostFactory, dt) {
  const now = Date.now();
  for (const [pid, entry] of peers) {
    if (now - entry.lastUpdateMs > STALE_MS) {
      if (entry.mesh) scene.remove(entry.mesh);
      peers.delete(pid);
      continue;
    }
    if (!entry.mesh) {
      entry.mesh = ghostFactory();
      scene.add(entry.mesh);
    }
    const s = entry.state;
    if (typeof s.x === 'number') entry.mesh.position.set(s.x, s.y, s.z);
    if (typeof s.qw === 'number') {
      entry.mesh.quaternion.set(s.qx, s.qy, s.qz, s.qw);
    }
  }
}
