// Flight data recorder: ring-buffer snapshots + CSV export + replay scrub.
// Pure data + pure functions — no DOM, no Three.js. The browser shell wraps
// it with download / playback UI; tests pin the buffer semantics.
//
// Why a ring buffer: a 30-minute flight at 20 Hz is 36k snapshots ≈ a few MB.
// Capping memory and overwriting oldest first keeps long sessions stable.

const DEFAULT_CAPACITY = 36000;        // 30 min @ 20 Hz
const DEFAULT_NUM_FORMAT = (n) => Number.isFinite(n) ? n.toFixed(4) : '';

export function createRecorder({ capacity = DEFAULT_CAPACITY } = {}) {
  return {
    capacity,
    snapshots: new Array(capacity),
    head: 0,                            // next write index
    count: 0,                           // entries currently held
    flags: { recording: false, replaying: false },
  };
}

export function isRecording(r) { return r.flags.recording; }
export function isReplaying(r) { return r.flags.replaying; }

export function startRecording(r) { r.flags.recording = true; }
export function stopRecording(r)  { r.flags.recording = false; }
export function beginReplay(r)    { r.flags.recording = false; r.flags.replaying = true; }
export function endReplay(r)      { r.flags.replaying = false; }

export function clear(r) {
  r.head = 0; r.count = 0;
  for (let i = 0; i < r.capacity; i++) r.snapshots[i] = undefined;
}

/** Push one snapshot. Snapshots should carry a numeric `t` field for sorting. */
export function recordSnapshot(r, snap) {
  if (!r.flags.recording) return;
  r.snapshots[r.head] = snap;
  r.head = (r.head + 1) % r.capacity;
  r.count = Math.min(r.count + 1, r.capacity);
}

/** Returns snapshots in chronological order (oldest → newest). */
export function getSnapshots(r) {
  if (r.count < r.capacity) return r.snapshots.slice(0, r.count);
  return r.snapshots.slice(r.head).concat(r.snapshots.slice(0, r.head));
}

/**
 * Find the most recent snapshot whose `t` is <= the requested time.
 * Returns the first/last snapshot when out of range.
 */
export function findAt(r, t) {
  const snaps = getSnapshots(r);
  if (snaps.length === 0) return null;
  if (t <= snaps[0].t) return snaps[0];
  if (t >= snaps[snaps.length - 1].t) return snaps[snaps.length - 1];

  // Binary search for largest index with snaps[i].t <= t.
  let lo = 0, hi = snaps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (snaps[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return snaps[lo];
}

/**
 * Encode the entire buffer to a CSV string. Header is the union of keys
 * from the first snapshot. Numbers use {@link DEFAULT_NUM_FORMAT}; objects
 * are JSON-stringified with commas escaped.
 */
export function toCSV(r, { fmt = DEFAULT_NUM_FORMAT } = {}) {
  const snaps = getSnapshots(r);
  if (snaps.length === 0) return '';
  const fields = Object.keys(snaps[0]);
  const lines = [fields.join(',')];
  for (const s of snaps) {
    const row = fields.map((f) => {
      const v = s[f];
      if (v === undefined || v === null) return '';
      if (typeof v === 'number') return fmt(v);
      if (typeof v === 'object') return JSON.stringify(v).replace(/,/g, ';');
      return String(v).replace(/,/g, ';');
    });
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
