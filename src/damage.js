// Damage state for the aircraft. Pure-data + pure functions so it can be
// unit tested without Three.js / DOM.
//
// Each component HP is in [0, 1]. 1.0 = pristine; 0.0 = destroyed.
// physics.js / main.js read these via the multiplier helpers below to scale
// lift, thrust, and control authority asymmetrically.

const COMPONENTS = ['fuselage', 'leftWing', 'rightWing', 'tail', 'engine'];

export function createDamageState() {
  return {
    fuselage: 1.0,
    leftWing: 1.0,
    rightWing: 1.0,
    tail: 1.0,
    engine: 1.0,
  };
}

/** Subtract `severity` from one component, clamped to 0. */
export function applyHit(state, component, severity) {
  if (!(component in state)) return;
  state[component] = Math.max(0, state[component] - severity);
}

export function isCrashed(state) {
  return state.fuselage <= 0;
}

/** Average integrity across all components — drives HUD's overall HP bar. */
export function totalIntegrity(state) {
  let s = 0;
  for (const k of COMPONENTS) s += state[k];
  return s / COMPONENTS.length;
}

/** Lift on each wing scales linearly with that wing's HP. */
export function liftMultiplier(state, side /* 'left' | 'right' */) {
  return side === 'left' ? state.leftWing : state.rightWing;
}

/** Available thrust scales with engine HP. */
export function thrustMultiplier(state) {
  return state.engine;
}

/**
 * Pitch/yaw control authority shrinks as the tail takes damage, but never
 * goes to zero — even a "torn" tail retains some aerodynamic stabilization
 * (this also keeps the integrator from blowing up).
 */
export function controlMultiplier(state) {
  return 0.2 + 0.8 * state.tail;
}
