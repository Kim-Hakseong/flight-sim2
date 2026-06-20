// State estimator (M11): sensor-in-the-loop filtering for the autopilot.
// COORDINATE: n/a — scalar/1-D filters.
//
// Why: feeding raw noisy sensors straight into a controller makes it chatter on
// noise. A constant-velocity 1-D Kalman filter fuses noisy position measurements
// (GPS) into a smoother position+velocity estimate; a first-order low-pass cleans
// angle/rate channels. The estimator smooths random noise but CANNOT remove a
// bias — so a GPS spoof/bias still fools the autopilot (the HILS lesson).

/** Create a Kalman state: position x, velocity v, and a 2×2 covariance P. */
export function createKF(pos = 0, vel = 0) {
  return { x: pos, v: vel, P00: 1, P01: 0, P10: 0, P11: 1 };
}

/**
 * One predict+update step of a constant-velocity 1-D Kalman filter.
 * Measures position z. Pure: returns a new state, input untouched.
 *
 * @param {object} s    previous state from createKF / kfStep
 * @param {number} z    position measurement
 * @param {number} dt   timestep (s)
 * @param {object} cfg  { q: process-noise (accel) density, r: measurement variance }
 */
export function kfStep(s, z, dt, cfg = {}) {
  const q = cfg.q ?? 1;
  const r = cfg.r ?? 1;

  // --- Predict:  x' = F x,  P' = F P Fᵀ + Q,  F = [[1,dt],[0,1]] ---
  const x_ = s.x + s.v * dt;
  const v_ = s.v;
  let P00 = s.P00 + dt * (s.P10 + s.P01) + dt * dt * s.P11;
  let P01 = s.P01 + dt * s.P11;
  let P10 = s.P10 + dt * s.P11;
  let P11 = s.P11;
  // Process noise (discrete white-noise acceleration).
  const dt2 = dt * dt, dt3 = dt2 * dt;
  P00 += q * dt3 / 3;
  P01 += q * dt2 / 2;
  P10 += q * dt2 / 2;
  P11 += q * dt;

  // --- Update:  measure position (H = [1,0]), innovation y = z − x' ---
  const y = z - x_;
  const S = P00 + r;
  const K0 = P00 / S;
  const K1 = P10 / S;
  const x = x_ + K0 * y;
  const v = v_ + K1 * y;
  // P = (I − K H) P'
  return {
    x, v,
    P00: (1 - K0) * P00,
    P01: (1 - K0) * P01,
    P10: P10 - K1 * P00,
    P11: P11 - K1 * P01,
  };
}

/**
 * First-order low-pass step toward z. Plain scalar — callers must pre-unwrap
 * angles. Pure. cutoff in rad/s (higher = faster tracking, less smoothing).
 */
export function lowpassStep(prev, z, dt, cutoff) {
  return prev + (z - prev) * Math.min(1, cutoff * dt);
}
