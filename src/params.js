// Tunable parameters (M4). The canonical table of autopilot gains + sensor-noise
// sigmas that the GCS can read (PARAM_REQUEST_LIST) and tune (PARAM_SET).
//
// PURE module — no DOM, no THREE — so the Node bridge imports it too. The bridge
// and the browser run as separate processes with separate copies of this store;
// they stay in sync because both start from the SAME defaults and a PARAM_SET is
// relayed to the sim over SSE (the bridge also re-sends overrides on (re)connect).
//
// param_id must be ≤16 chars (MAVLink char[16]). Defaults MUST match the live
// constants in autopilot.js / main.js so an untouched sim flies bit-identically
// (keeps the deterministic autoland regression green).

export const PARAM_DEFS = [
  // --- Autopilot guidance/control gains (applied in autopilot.js) ---
  { id: 'AP_HDG2BANK',   def: 1.1,    min: 0.2,   max: 3.0  },  // heading-err → bank
  { id: 'AP_ALT2PITCH',  def: 0.012,  min: 0.002, max: 0.05 },  // alt-err → pitch (rad/m)
  { id: 'AP_MAXBANK',    def: 25,     min: 5,     max: 45   },  // bank limit (deg)
  { id: 'AP_TGT_SPEED',  def: 50,     min: 30,    max: 90   },  // cruise speed (m/s)
  { id: 'AP_PITCH_KP',   def: 1.0,    min: 0.2,   max: 3.0  },  // pitch inner P
  { id: 'AP_ROLLRATEKP', def: 2.5,    min: 0.5,   max: 6.0  },  // roll-rate inner P
  // --- Sensor-noise sigmas (applied in main.js SENSOR_CFG) ---
  { id: 'SNS_GPS_NOISE', def: 1.5,    min: 0,     max: 10   },  // GPS position σ (m)
  { id: 'SNS_GYRO_NOISE',def: 0.15,   min: 0,     max: 2    },  // IMU gyro σ (deg/s)
];

const DEFS_BY_ID = new Map(PARAM_DEFS.map((p) => [p.id, p]));
const values = new Map(PARAM_DEFS.map((p) => [p.id, p.def]));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function paramCount() { return PARAM_DEFS.length; }

export function getParam(id) { return values.get(id); }

/** { id, index, value } for the GCS list, in stable index order. */
export function listParams() {
  return PARAM_DEFS.map((p, i) => ({ id: p.id, index: i, value: values.get(p.id) }));
}

export function getParamByIndex(i) {
  const p = PARAM_DEFS[i];
  return p ? { id: p.id, index: i, value: values.get(p.id) } : null;
}

export function getParamEntry(id) {
  const i = PARAM_DEFS.findIndex((p) => p.id === id);
  return i >= 0 ? { id, index: i, value: values.get(id) } : null;
}

/**
 * Set a parameter (clamped to its declared range). Unknown ids are ignored.
 * Returns the applied value, or null if the id is unknown.
 */
export function setParam(id, value) {
  const def = DEFS_BY_ID.get(id);
  if (!def || !Number.isFinite(value)) return null;
  const v = clamp(value, def.min, def.max);
  values.set(id, v);
  return v;
}

/** Params whose value differs from the default — for re-sending to a late client. */
export function getOverrides() {
  return PARAM_DEFS
    .filter((p) => values.get(p.id) !== p.def)
    .map((p) => ({ id: p.id, value: values.get(p.id) }));
}
