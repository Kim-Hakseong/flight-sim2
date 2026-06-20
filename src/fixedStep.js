// Deterministic fixed-step scheduler + integrator (M7).
// COORDINATE: n/a — time-domain utilities, frame-agnostic.
//
// Why: a variable requestAnimationFrame dt makes the simulation non-reproducible
// — the same control inputs yield different trajectories at 30 vs 144 fps. HILS,
// record/replay, and V&V all require that physics advance in fixed increments so
// (initial state + input sequence) → identical output. This module decouples the
// physics rate from the render rate via an accumulator, and provides a pure RK4
// integrator for future moment-based 6-DOF dynamics.

export const PHYS_HZ = 200;            // physics steps per simulated second
export const DT_PHYS = 1 / PHYS_HZ;    // 0.005 s fixed timestep
export const MAX_SUBSTEPS = 60;        // spiral-of-death guard (≤ 0.3 s of sim / frame)

/**
 * Plan how many fixed steps to run for an accumulated amount of frame time.
 * Pure: no mutation, no wall-clock, no RNG. Same inputs → same outputs.
 *
 * The accumulator pattern: callers add each render frame's dt to a running
 * accumulation and pass it here. We run as many whole DT_PHYS steps as fit and
 * carry the sub-step remainder to the next frame, so total simulated time is
 * independent of how the wall-clock frames are partitioned.
 *
 * @param {number} accumulatedSeconds  accumulated unsimulated time (s)
 * @param {number} [dtPhys=DT_PHYS]     fixed timestep (s)
 * @param {number} [maxSteps=MAX_SUBSTEPS] per-call clamp (spiral-of-death guard)
 * @returns {{steps:number, remainder:number, alpha:number, dropped:number}}
 *   steps     integer fixed steps to execute now
 *   remainder leftover sub-step time carried forward (0 ≤ remainder < dtPhys)
 *   alpha     remainder / dtPhys ∈ [0,1) — render interpolation factor
 *   dropped   simulated seconds shed by the maxSteps clamp (≥ 0)
 */
export function planSteps(accumulatedSeconds, dtPhys = DT_PHYS, maxSteps = MAX_SUBSTEPS) {
  // Guard against non-positive / NaN / undefined accumulation.
  if (!(accumulatedSeconds > 0) || !(dtPhys > 0)) {
    const rem = accumulatedSeconds > 0 ? accumulatedSeconds : 0;
    return { steps: 0, remainder: rem, alpha: dtPhys > 0 ? rem / dtPhys : 0, dropped: 0 };
  }

  // Absorb binary fp boundary error so accumulated == N·dt yields exactly N
  // steps (e.g. 0.005/0.005 landing at 0.9999999 → floor 0 would stall a frame).
  const eps = dtPhys * 1e-6;
  let steps = Math.floor((accumulatedSeconds + eps) / dtPhys);
  let dropped = 0;

  if (steps > maxSteps) {
    dropped = (steps - maxSteps) * dtPhys;
    steps = maxSteps;
  }

  let remainder = accumulatedSeconds - dropped - steps * dtPhys;
  if (remainder < 0) remainder = 0;          // fp safety
  const alpha = remainder / dtPhys;
  return { steps, remainder, alpha, dropped };
}

/**
 * Classic 4th-order Runge–Kutta step for an ODE system y' = f(t, y).
 * Pure: returns a fresh array; never mutates `y`. Deterministic.
 *
 * @param {number[]} y   state vector
 * @param {number}   t   current time
 * @param {number}   dt  step (s)
 * @param {(t:number, y:number[]) => number[]} f  derivative function
 * @returns {number[]} state at t + dt
 */
export function rk4Step(y, t, dt, f) {
  const n = y.length;
  const k1 = f(t, y);

  const y2 = new Array(n);
  for (let i = 0; i < n; i++) y2[i] = y[i] + 0.5 * dt * k1[i];
  const k2 = f(t + 0.5 * dt, y2);

  const y3 = new Array(n);
  for (let i = 0; i < n; i++) y3[i] = y[i] + 0.5 * dt * k2[i];
  const k3 = f(t + 0.5 * dt, y3);

  const y4 = new Array(n);
  for (let i = 0; i < n; i++) y4[i] = y[i] + dt * k3[i];
  const k4 = f(t + dt, y4);

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = y[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  return out;
}
