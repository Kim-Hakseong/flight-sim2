// Sensor model (M9).
// COORDINATE: n/a — maps a scalar truth value to a measured value.
//
// Why: HILS / V&V needs the difference between truth (what the airframe really
// does) and measurement (what the avionics see). A sensor adds scale-factor and
// bias errors, Gaussian noise, and lag, and can fail. Noise is drawn from a
// SEEDED PRNG so the simulation stays deterministic (no Math.random) — see M7.

/**
 * Mulberry32 — a small, fast, deterministic PRNG. Returns a function yielding
 * floats in [0,1). Same seed → same sequence.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample (Box–Muller) drawn from a [0,1) rng. */
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng(); // avoid log(0)
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Advance one sensor channel by dt. Pure w.r.t. cfg/fault (the rng is, by
 * nature, an advancing stream). Returns the measured value.
 *
 * @param {number} prev   previous measured value (for lag / hold)
 * @param {number} truth  current true value
 * @param {number} dt     timestep (s)
 * @param {object} cfg    { scale=1, bias=0, noise=0 (σ), bandwidth=Inf (rad/s) }
 * @param {function} rng  seeded [0,1) generator (advanced when noise>0)
 * @param {object|null} [fault] { type:'frozen'|'dropout'|'bias', value }
 * @returns {number} measured value
 */
export function stepSensor(prev, truth, dt, cfg, rng, fault = null) {
  const ftype = fault && fault.type;

  // 'frozen' = stuck data: the channel holds its last value.
  if (ftype === 'frozen') return prev;
  // 'dropout' = lost signal: flatline at a configured value (default 0).
  if (ftype === 'dropout') return fault.value ?? 0;

  const scale = cfg.scale ?? 1;
  const bias = cfg.bias ?? 0;
  const noise = cfg.noise ?? 0;
  const bandwidth = cfg.bandwidth ?? Infinity;

  // Instantaneous reading: scale + bias + Gaussian noise.
  // A 'bias' fault shifts the READING (the lag target), so the channel settles
  // at truth + value instead of re-adding the offset every call (a runaway).
  let reading = truth * scale + bias + (noise > 0 ? gaussian(rng) * noise : 0);
  if (ftype === 'bias') reading += fault.value || 0;

  // First-order lag toward the reading.
  const lag = Number.isFinite(bandwidth) ? Math.min(1, bandwidth * dt) : 1;
  return prev + (reading - prev) * lag;
}
