// Flight dynamics — pure functions where possible.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.
//
// Conventions:
//   pitch up (nose up)        = +
//   roll right (right wing dn) = +
//   yaw right (nose right)     = +

export const AIR_DENSITY_SL = 1.225;       // kg/m^3 at sea level
export const SCALE_HEIGHT = 8500;           // m, atmospheric scale height
export const GRAVITY = 9.81;                // m/s^2

// Lift curve (Cessna-ish).
export const CL0 = 0.30;
export const CL_ALPHA = 5.7;                // 1/rad
export const STALL_AOA_RAD = 16 * Math.PI / 180;
// Post-stall: CL decays linearly back toward zero by ~30°.
const POST_STALL_DECAY = 3.0;               // 1/rad: CL drop per rad past stall

// Drag polar.
export const CD0 = 0.028;
export const K_INDUCED = 0.053;             // 1/(pi * AR * e), AR≈7.5, e≈0.8

/** ρ(h) = ρ0 · exp(−h / H). Negative h is clamped to zero. */
export function airDensity(altitudeMeters) {
  const h = Math.max(0, altitudeMeters);
  return AIR_DENSITY_SL * Math.exp(-h / SCALE_HEIGHT);
}

/** Lift coefficient as a function of AoA (radians). Stall handled. */
export function liftCoefficient(alphaRad) {
  const linear = CL0 + CL_ALPHA * alphaRad;
  if (alphaRad <= STALL_AOA_RAD && alphaRad >= -STALL_AOA_RAD) {
    return linear;
  }
  // Past stall (positive or negative): CL drops past the linear peak.
  const peakSign = Math.sign(alphaRad);
  const clPeak = CL0 + CL_ALPHA * STALL_AOA_RAD * peakSign;
  const excess = Math.abs(alphaRad) - STALL_AOA_RAD;
  const drop = POST_STALL_DECAY * excess;
  let cl = (Math.abs(clPeak) - drop) * peakSign;
  // Don't let it cross zero into the wrong sign.
  if (peakSign > 0 && cl < 0) cl = 0;
  if (peakSign < 0 && cl > 0) cl = 0;
  return cl;
}

/** Drag coefficient: parabolic in CL. */
export function dragCoefficient(cl) {
  return CD0 + K_INDUCED * cl * cl;
}

/** Lift magnitude: 0.5 · ρ · v² · S · CL. */
export function liftForce({ rho, v, area, cl }) {
  return 0.5 * rho * v * v * area * cl;
}

/** Drag magnitude: 0.5 · ρ · v² · S · CD. */
export function dragForce({ rho, v, area, cd }) {
  return 0.5 * rho * v * v * area * cd;
}

/**
 * Angle of attack from velocity vector and body axes.
 * AoA is measured in the body's pitch plane (forward × up).
 *
 *   v_forward = v · forward    (component of velocity along nose)
 *   v_up      = v · up         (component of velocity along body up)
 *
 * If the aircraft is sinking (v_up < 0) while moving forward, the relative
 * wind comes from below → +AoA. Hence: AoA = atan2(−v_up, v_forward).
 */
export function angleOfAttack(velocity, forward, up) {
  const vF = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
  const vU = velocity.x * up.x + velocity.y * up.y + velocity.z * up.z;
  if (Math.abs(vF) < 1e-6 && Math.abs(vU) < 1e-6) return 0;
  return Math.atan2(-vU, vF);
}
