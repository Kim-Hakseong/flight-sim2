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

// High-lift devices (M21). Flaps raise CL (lower stall speed → slower approach)
// and CD (steeper, slower descent). Spoilers raise CD and dump lift (descent +
// rollout braking). Deflections are 0..1.
export const CL_FLAP    = 0.35;  // extra CL at full flaps (modest — avoids ballooning)
export const CD_FLAP    = 0.16;  // extra CD at full flaps (drag for a slow, steep approach)
export const CD_SPOILER = 0.12;  // extra CD at full spoilers
export const SPOILER_LIFT_DUMP = 0.5; // fraction of lift dumped at full spoilers

/** Apply flap/spoiler effects to base CL/CD. Pure. */
export function highLift(clBase, cdBase, flap = 0, spoiler = 0) {
  const cl = (clBase + CL_FLAP * flap) * (1 - SPOILER_LIFT_DUMP * spoiler);
  const cd = cdBase + CD_FLAP * flap + CD_SPOILER * spoiler;
  return { cl, cd };
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

// ===================================================================
// Moment-based 6-DOF rotational dynamics (M8).
//
// Aviation rate convention (so derivative signs read like a textbook):
//   p = roll-right (right wing down) +,  q = pitch-up +,  r = yaw-right +
//   β = +  when the relative wind has a component toward the +X (right) wing.
// main.js maps these to the sim's body angular velocity: q=ω.x, r=ω.y, p=−ω.z.
// ===================================================================

// Mass moments of inertia for a ~1000 kg light aircraft (kg·m²). Ixz is the
// roll↔yaw product of inertia (small for a symmetric airframe).
export const INERTIA = { Ixx: 1300, Iyy: 1800, Izz: 2700, Ixz: 60 };

// Dimensionless stability & control derivatives. Static stability: Cm_alpha<0
// (pitch), Cn_beta>0 (weathercock), Cl_beta<0 (dihedral). Rate terms are damping.
// Control power (Cm_de/Cl_da/Cn_dr) is sized so authority at cruise (~50 m/s)
// is comparable to the previous rate-command model, keeping the aircraft flyable.
export const AERO_DERIV = {
  // pitch (Cm, nose-up +)
  Cm0: 0.04, Cm_alpha: -0.9, Cm_q: -18, Cm_de: 1.5,
  // roll (Cl, roll-right +). Lower aileron power + stronger roll damping give a
  // realistic light-aircraft roll rate (~70°/s) instead of a fighter-like snap.
  Cl_beta: -0.07, Cl_p: -0.55, Cl_da: 0.10,
  // yaw (Cn, yaw-right +). Strong yaw-rate damping (Cn_r) is what keeps the
  // dutch-roll mode damped so a banked turn settles instead of diverging.
  Cn_beta: 0.10, Cn_r: -0.75, Cn_dr: 0.12,
  // side force (CY along +X right wing). CY_beta<0 ⇒ sideslip is opposed.
  CY_beta: -0.30,
};

/**
 * Sideslip angle β (radians) from the velocity vector and body axes.
 * +β when the relative wind has a component toward the +X (right) wing.
 */
export function sideslipAngle(velocity, forward, right) {
  const vF = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
  const vR = velocity.x * right.x + velocity.y * right.y + velocity.z * right.z;
  if (Math.abs(vF) < 1e-6 && Math.abs(vR) < 1e-6) return 0;
  return Math.atan2(vR, vF);
}

/**
 * Aerodynamic moments (N·m) from the stability & control derivative buildup.
 * Returns { L, M, N } in the aviation convention (roll-right, pitch-up, yaw-right +).
 * Rate terms are nondimensionalized by the usual span/chord over 2V factors.
 */
export function aeroMoments({
  qbar, S, span, chord, V,
  alpha = 0, beta = 0, p = 0, q = 0, r = 0,
  elevator = 0, aileron = 0, rudder = 0,
  deriv = AERO_DERIV,
}) {
  const d = (k) => deriv[k] || 0;
  const Vs = Math.max(V, 1e-3);
  const phat = p * span / (2 * Vs);
  const qhat = q * chord / (2 * Vs);
  const rhat = r * span / (2 * Vs);

  const Cl = d('Cl_beta') * beta + d('Cl_p') * phat + d('Cl_da') * aileron;
  const Cm = d('Cm0') + d('Cm_alpha') * alpha + d('Cm_q') * qhat + d('Cm_de') * elevator;
  const Cn = d('Cn_beta') * beta + d('Cn_r') * rhat + d('Cn_dr') * rudder;

  return {
    L: qbar * S * span * Cl,
    M: qbar * S * chord * Cm,
    N: qbar * S * span * Cn,
  };
}

/**
 * Lateral aerodynamic (side) force along the body +X (right wing) axis, from
 * sideslip: Y = qbar · S · CY_β · β. With CY_β < 0 the force opposes the slip,
 * which (together with weathercock yaw) gives coordinated-turn behavior.
 * Returns a scalar in newtons (sign along +X right).
 */
export function sideForce({ qbar, S, beta, deriv = AERO_DERIV }) {
  return qbar * S * (deriv.CY_beta || 0) * beta;
}

/**
 * Angular acceleration from Euler's rigid-body equation:
 *     ω̇ = I⁻¹ · (M − ω × (I·ω))
 * Specialized for an airframe symmetric about the X–Z plane (only Ixz coupling).
 * Inputs are not mutated. Returns { dp, dq, dr }.
 */
export function bodyAngularAccel({ p, q, r }, { L, M, N }, inertia = INERTIA) {
  const { Ixx, Iyy, Izz, Ixz } = inertia;

  // Angular momentum H = I·ω  (with the Ixz product of inertia coupling p↔r).
  const Hx = Ixx * p + Ixz * r;
  const Hy = Iyy * q;
  const Hz = Ixz * p + Izz * r;

  // Gyroscopic term ω × H.
  const gx = q * Hz - r * Hy;
  const gy = r * Hx - p * Hz;
  const gz = p * Hy - q * Hx;

  // RHS = M − ω×H.
  const rx = L - gx;
  const ry = M - gy;
  const rz = N - gz;

  // Pitch axis decouples; roll/yaw share the 2×2 [Ixx Ixz; Ixz Izz] block.
  const dq = ry / Iyy;
  const det = Ixx * Izz - Ixz * Ixz;
  const dp = (Izz * rx - Ixz * rz) / det;
  const dr = (Ixx * rz - Ixz * rx) / det;
  return { dp, dq, dr };
}
