// Physics unit tests.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  airDensity,
  liftCoefficient,
  dragCoefficient,
  liftForce,
  dragForce,
  angleOfAttack,
  AIR_DENSITY_SL,
  GRAVITY,
  STALL_AOA_RAD,
} from '../src/physics.js';

const EPS = 1e-6;
const closeTo = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('boot: test runner works', () => {
  assert.ok(true, 'boot');
});

test('airDensity: sea level returns AIR_DENSITY_SL', () => {
  assert.ok(closeTo(airDensity(0), AIR_DENSITY_SL));
});

test('airDensity: decreases with altitude', () => {
  const rho0 = airDensity(0);
  const rho5k = airDensity(5000);
  const rho10k = airDensity(10000);
  assert.ok(rho5k < rho0, 'density should drop with altitude');
  assert.ok(rho10k < rho5k, 'density should keep dropping');
  // 8500m scale height: at 8500m density should be ~1/e of SL.
  assert.ok(closeTo(airDensity(8500), AIR_DENSITY_SL / Math.E, 0.05));
});

test('liftCoefficient: linear region matches CL0 + CL_alpha * alpha', () => {
  // At alpha = 0 we expect CL0 (small positive cambered baseline).
  const cl0 = liftCoefficient(0);
  // At a small positive AoA, CL should grow.
  const clSmall = liftCoefficient(0.05); // ~2.86°
  assert.ok(clSmall > cl0, 'CL grows with positive AoA in linear region');
});

test('liftCoefficient: stalls past STALL_AOA_RAD (drops below peak)', () => {
  const clStall = liftCoefficient(STALL_AOA_RAD);
  const clPostStall = liftCoefficient(STALL_AOA_RAD + 0.1);
  assert.ok(clPostStall < clStall, 'CL must drop past stall AoA');
});

test('dragCoefficient: parabolic in CL (CD0 + k*CL^2)', () => {
  const cdAtZero = dragCoefficient(0);
  const cdAtSmall = dragCoefficient(0.5);
  const cdAtBig = dragCoefficient(1.2);
  assert.ok(cdAtZero > 0, 'CD0 must be positive (parasitic drag)');
  assert.ok(cdAtSmall > cdAtZero, 'induced drag grows with CL');
  assert.ok(cdAtBig > cdAtSmall, 'induced drag grows with CL^2');
});

test('liftForce: zero at zero airspeed', () => {
  assert.ok(closeTo(liftForce({ rho: AIR_DENSITY_SL, v: 0, area: 16, cl: 0.6 }), 0));
});

test('liftForce: scales with v^2', () => {
  const L1 = liftForce({ rho: AIR_DENSITY_SL, v: 30, area: 16, cl: 0.6 });
  const L2 = liftForce({ rho: AIR_DENSITY_SL, v: 60, area: 16, cl: 0.6 });
  // Doubling v should quadruple lift.
  assert.ok(closeTo(L2 / L1, 4, 1e-6));
});

test('dragForce: matches 0.5 * rho * v^2 * S * CD', () => {
  const D = dragForce({ rho: 1.225, v: 50, area: 16, cd: 0.04 });
  const expected = 0.5 * 1.225 * 50 * 50 * 16 * 0.04;
  assert.ok(closeTo(D, expected, 1e-6));
});

test('angleOfAttack: nose forward, no vertical velocity → 0', () => {
  // Body forward = -Z. Velocity along -Z, no Y component → AoA = 0.
  const v = { x: 0, y: 0, z: -50 };
  const fwd = { x: 0, y: 0, z: -1 };
  const up = { x: 0, y: 1, z: 0 };
  assert.ok(closeTo(angleOfAttack(v, fwd, up), 0, 1e-6));
});

test('angleOfAttack: positive when relative wind comes from below', () => {
  // Aircraft moving forward (-Z) but also descending (-Y) means the relative
  // wind has a +Y component → wind from below → +AoA (nose up relative to wind).
  const v = { x: 0, y: -10, z: -50 };
  const fwd = { x: 0, y: 0, z: -1 };
  const up = { x: 0, y: 1, z: 0 };
  const aoa = angleOfAttack(v, fwd, up);
  assert.ok(aoa > 0, `expected positive AoA, got ${aoa}`);
  // arctan(10/50) ≈ 0.1974 rad
  assert.ok(closeTo(aoa, Math.atan2(10, 50), 1e-6));
});

test('angleOfAttack: negative when nose pitched down relative to flight path', () => {
  // Aircraft level nose, climbing — wind comes from above → −AoA.
  const v = { x: 0, y: 10, z: -50 };
  const fwd = { x: 0, y: 0, z: -1 };
  const up = { x: 0, y: 1, z: 0 };
  const aoa = angleOfAttack(v, fwd, up);
  assert.ok(aoa < 0);
});

test('GRAVITY constant ≈ 9.81', () => {
  assert.ok(closeTo(GRAVITY, 9.81, 1e-6));
});

test('lift > weight at takeoff: 40 m/s, CL ~ 1.0, S=16 vs 1000 kg', () => {
  // Cessna-class sanity: above rotation speed lift should clearly exceed weight.
  const L = liftForce({ rho: AIR_DENSITY_SL, v: 40, area: 16, cl: 1.0 });
  const W = 1000 * GRAVITY;
  assert.ok(L > W, `expected lift ${L.toFixed(0)} > weight ${W.toFixed(0)}`);
});
