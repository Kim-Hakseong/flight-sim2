// Lateral-directional stability analysis tests (M16). Linearize the airframe's
// lateral dynamics and check the modes (dutch-roll / roll / spiral) are stable —
// turning blind tuning into analysis.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  charPoly,
  routhHurwitzStable,
  numericalJacobian,
  lateralStability,
} from '../src/lateral.js';
import { AERO_DERIV, INERTIA } from '../src/physics.js';

const closeArr = (a, b, eps = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);

// ---------- charPoly (Faddeev–LeVerrier) ----------

test('charPoly: diagonal matrix → product of (λ−dᵢ)', () => {
  // diag(-1,-2) → (λ+1)(λ+2) = λ² + 3λ + 2
  const p = charPoly([[-1, 0], [0, -2]]);
  assert.ok(closeArr(p, [1, 3, 2]), `got ${p}`);
});

test('charPoly: companion form matches its polynomial', () => {
  // [[0,1],[-2,-3]] has char poly λ² + 3λ + 2
  const p = charPoly([[0, 1], [-2, -3]]);
  assert.ok(closeArr(p, [1, 3, 2]), `got ${p}`);
});

test('charPoly: 3×3 known matrix', () => {
  // diag(-1,-2,-3) → λ³ + 6λ² + 11λ + 6
  const p = charPoly([[-1, 0, 0], [0, -2, 0], [0, 0, -3]]);
  assert.ok(closeArr(p, [1, 6, 11, 6]), `got ${p}`);
});

// ---------- Routh–Hurwitz ----------

test('routhHurwitzStable: all-negative-root polynomial is stable', () => {
  assert.equal(routhHurwitzStable([1, 3, 2]), true);          // roots -1,-2
  assert.equal(routhHurwitzStable([1, 6, 11, 6]), true);      // roots -1,-2,-3
});

test('routhHurwitzStable: a sign change makes it unstable', () => {
  assert.equal(routhHurwitzStable([1, -1, 2]), false);
  assert.equal(routhHurwitzStable([1, 1, 0, 1]), false);      // missing/zero term
});

// ---------- numerical Jacobian ----------

test('numericalJacobian: linear map → its matrix', () => {
  const f = (x) => [2 * x[0] + x[1], -3 * x[1]];
  const J = numericalJacobian(f, [0, 0]);
  assert.ok(Math.abs(J[0][0] - 2) < 1e-4 && Math.abs(J[0][1] - 1) < 1e-4);
  assert.ok(Math.abs(J[1][0]) < 1e-4 && Math.abs(J[1][1] + 3) < 1e-4);
});

// ---------- airframe lateral stability (the M16 goal) ----------

const CRUISE = { deriv: AERO_DERIV, inertia: INERTIA, m: 1000, V: 50, rho: 1.2, S: 16, span: 11, chord: 1.46, g: 9.81, alpha: 0.05 };

test('lateralStability: returns a 4-state model (β, p, r, φ)', () => {
  const res = lateralStability(CRUISE);
  assert.equal(res.A.length, 4);
  assert.equal(res.poly.length, 5);           // quartic
  // φ̇ = p row of the Jacobian
  assert.ok(Math.abs(res.A[3][1] - 1) < 1e-3, `φ̇ should equal p, got ${res.A[3][1]}`);
});

test('lateralStability: the airframe is laterally stable at cruise', () => {
  const res = lateralStability(CRUISE);
  assert.equal(res.stable, true, `lateral dynamics unstable: poly=${res.poly}`);
});
