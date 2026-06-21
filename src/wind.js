// Atmospheric wind model (M22).
// COORDINATE: world frame (Three.js +Y up, −Z north). Wind is the velocity of
// the AIR; aerodynamics use (aircraft velocity − wind).
//
// Steady wind + first-order Gauss–Markov (Ornstein–Uhlenbeck) turbulence — a
// simple Dryden-like gust that is correlated in time, bounded, and (with a seeded
// RNG) deterministic so the simulation stays reproducible.

import { gaussian } from './sensors.js';

const TAU = 1.8;   // s — gust correlation time
const VERT = 0.15; // vertical gusts are much milder than horizontal: a vertical gust
                   // directly spikes the angle of attack, and this slick airframe
                   // departs if AoA crosses the stall, so keep the vertical component
                   // gentle. The crosswind challenge lives in the horizontal gusts.
const SHEAR_REF = 40;  // m — boundary-layer height: wind ramps 0 (surface) → full

/**
 * Boundary-layer wind shear: surface friction drives the wind to ≈0 at the
 * ground and up to full strength by `ref` metres AGL. Multiply the wind vector
 * by this so the ground roll stays calm (no tyre model needed) while the
 * approach still flies through a real crosswind that eases near touchdown.
 *
 * @param {number} altAGL  height above ground (m)
 * @param {number} ref     reference height for full wind (m)
 * @returns {number} factor in [0, 1]
 */
export function shearFactor(altAGL, ref = SHEAR_REF) {
  if (!(altAGL > 0)) return 0;
  return Math.min(1, altAGL / ref);
}

/**
 * Advance the gust state by dt and return the total wind. Pure: inputs are not
 * mutated. `intensity` is the gust RMS (m/s); 0 = steady wind only.
 *
 * @param {{x,y,z}} steady    steady wind vector (world)
 * @param {{x,y,z}} gust      current gust state
 * @param {number}  dt        timestep (s)
 * @param {function} rng      seeded [0,1) generator (advanced when intensity>0)
 * @param {number}  intensity gust RMS (m/s)
 * @returns {{ gust:{x,y,z}, wind:{x,y,z} }}
 */
export function windStep(steady, gust, dt, rng, intensity = 0) {
  if (!(intensity > 0)) {
    return { gust: { x: gust.x, y: gust.y, z: gust.z }, wind: { ...steady } };
  }
  // OU update: g ← g·(1 − dt/τ) + σ·√(2 dt/τ)·N(0,1)
  const decay = Math.max(0, 1 - dt / TAU);
  const kick = intensity * Math.sqrt(2 * dt / TAU);
  const ng = {
    x: gust.x * decay + kick * gaussian(rng),
    y: (gust.y * decay + kick * gaussian(rng)) * VERT,
    z: gust.z * decay + kick * gaussian(rng),
  };
  return {
    gust: ng,
    wind: { x: steady.x + ng.x, y: steady.y + ng.y, z: steady.z + ng.z },
  };
}
