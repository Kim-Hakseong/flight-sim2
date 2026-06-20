// Control-surface actuator model (M9).
// COORDINATE: n/a — operates on scalar normalized deflections in [min,max].
//
// Why: a real control surface does not instantly assume the commanded deflection.
// It has finite bandwidth (servo lag), a maximum slew rate, mechanical travel
// limits, and can fail. Inserting this between command and airframe lets us test
// flight-control laws against realistic actuation and inject HILS faults.

const DEFAULT = { bandwidth: 30, rateLimit: Infinity, min: -1, max: 1 };

/**
 * Advance one actuator by dt. Pure: inputs are not mutated.
 *
 * @param {number} pos      current surface position (normalized)
 * @param {number} command  commanded position (normalized)
 * @param {number} dt       timestep (s)
 * @param {object} [cfg]    { bandwidth (rad/s, 1st-order lag), rateLimit (1/s),
 *                            min, max }
 * @param {object|null} [fault]  { type: 'stuck'|'offset'|'float'|'slow', value, factor }
 * @returns {number} new surface position
 */
export function stepActuator(pos, command, dt, cfg = {}, fault = null) {
  const c = { ...DEFAULT, ...cfg };
  const ftype = fault && fault.type;

  // 'stuck' freezes the surface wherever it is, ignoring the command.
  if (ftype === 'stuck') return clamp(pos, c.min, c.max);

  // 'float' = loss of drive: the surface trails to neutral regardless of command.
  // 'offset' = a biased actuator that settles at command + bias (within travel).
  let target = ftype === 'float' ? 0 : clamp(command, c.min, c.max);
  if (ftype === 'offset') target = clamp(target + (fault.value || 0), c.min, c.max);

  // 'slow' reduces effective bandwidth (degraded actuator).
  const bandwidth = ftype === 'slow' ? c.bandwidth * (fault.factor ?? 0.25) : c.bandwidth;

  // First-order lag toward the target.
  const lag = Number.isFinite(bandwidth) ? Math.min(1, bandwidth * dt) : 1;
  let delta = (target - pos) * lag;

  // Slew-rate limit.
  const maxStep = c.rateLimit * dt;
  if (delta > maxStep) delta = maxStep;
  else if (delta < -maxStep) delta = -maxStep;

  return clamp(pos + delta, c.min, c.max);
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
