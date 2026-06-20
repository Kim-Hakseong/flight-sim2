// Lateral-directional stability analysis (M16).
// COORDINATE: aviation lateral convention (p=roll-right, r=yaw-right, β, φ=bank).
//
// Linearizes the airframe's lateral dynamics about level trim and checks the
// modes (dutch-roll, roll subsidence, spiral) are stable — replacing blind
// autopilot tuning with analysis: if the open-loop airframe is unstable, no
// control gains help; fix the derivatives first.

import { aeroMoments, bodyAngularAccel, sideForce } from './physics.js';

// ---------- linear-algebra helpers ----------

/** Characteristic polynomial of A via Faddeev–LeVerrier: det(λI − A).
 * Returns coefficients [1, c1, …, cn] (descending powers of λ). Pure. */
export function charPoly(A) {
  const n = A.length;
  const I = identity(n);
  let M = identity(n);            // M₁ = I
  const c = [1];
  for (let k = 1; k <= n; k++) {
    const AM = matMul(A, M);
    const ck = -trace(AM) / k;
    c.push(ck);
    // M_{k+1} = A·M_k + c_k·I
    M = matAdd(AM, scale(I, ck));
  }
  return c;
}

/** Routh–Hurwitz: true iff every root of the polynomial (descending coeffs,
 * leading 1) has a strictly negative real part. Pure. */
export function routhHurwitzStable(coeffs) {
  const a = coeffs.slice();
  const n = a.length - 1;
  if (a[0] <= 0) return false;
  // Necessary: all coefficients strictly positive.
  if (a.some((v) => v <= 0)) return false;

  // Build the Routh array.
  const rows = [];
  rows[0] = [];
  rows[1] = [];
  for (let i = 0; i <= n; i++) (i % 2 === 0 ? rows[0] : rows[1]).push(a[i]);

  for (let r = 2; r <= n; r++) {
    rows[r] = [];
    const above = rows[r - 1];
    const above2 = rows[r - 2];
    const lead = above[0];
    if (lead === 0) return false; // simplified: treat as unstable/marginal
    for (let j = 0; j + 1 < Math.max(above2.length, above.length); j++) {
      const a2b = above2[j + 1] ?? 0;
      const ab = above[j + 1] ?? 0;
      rows[r].push((lead * a2b - above2[0] * ab) / lead);
    }
    if (rows[r].length === 0) rows[r].push(0);
  }

  // Stable iff the whole first column is strictly positive.
  for (let r = 0; r <= n; r++) {
    if ((rows[r][0] ?? 0) <= 0) return false;
  }
  return true;
}

/** Central-difference Jacobian of f: Rⁿ→Rⁿ at x0. Pure. */
export function numericalJacobian(f, x0, h = 1e-6) {
  const n = x0.length;
  const J = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const xp = x0.slice(); xp[j] += h;
    const xm = x0.slice(); xm[j] -= h;
    const fp = f(xp), fm = f(xm);
    for (let i = 0; i < n; i++) J[i][j] = (fp[i] - fm[i]) / (2 * h);
  }
  return J;
}

// ---------- lateral dynamics ----------

/**
 * Lateral-directional state derivative [β̇, ṗ, ṙ, φ̇] from state [β, p, r, φ],
 * using the actual airframe aero/inertia at a level-trim cruise condition.
 */
export function lateralDerivatives([beta, p, r, phi], c) {
  const qbar = 0.5 * c.rho * c.V * c.V;
  const m = aeroMoments({
    qbar, S: c.S, span: c.span, chord: c.chord, V: c.V,
    alpha: c.alpha, beta, p, q: 0, r, elevator: 0, aileron: 0, rudder: 0, deriv: c.deriv,
  });
  const Y = sideForce({ qbar, S: c.S, beta, deriv: c.deriv });
  const acc = bodyAngularAccel({ p, q: 0, r }, { L: m.L, M: 0, N: m.N }, c.inertia);
  // Small-angle level-flight sideslip kinematics: β̇ = Y/(mV) − r + (g/V)·φ.
  const betaDot = Y / (c.m * c.V) - r + (c.g / c.V) * phi;
  return [betaDot, acc.dp, acc.dr, p];
}

/** Linearize the lateral dynamics at trim and report stability + modes. */
export function lateralStability(cond) {
  const A = numericalJacobian((x) => lateralDerivatives(x, cond), [0, 0, 0, 0], 1e-5);
  const poly = charPoly(A);
  return { A, poly, stable: routhHurwitzStable(poly) };
}

// ---------- tiny matrix utils ----------

function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}
function matMul(A, B) {
  const n = A.length, mB = B[0].length, k = B.length;
  const C = Array.from({ length: n }, () => new Array(mB).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < mB; j++) { let s = 0; for (let t = 0; t < k; t++) s += A[i][t] * B[t][j]; C[i][j] = s; }
  return C;
}
function matAdd(A, B) { return A.map((row, i) => row.map((v, j) => v + B[i][j])); }
function scale(A, s) { return A.map((row) => row.map((v) => v * s)); }
function trace(A) { let s = 0; for (let i = 0; i < A.length; i++) s += A[i][i]; return s; }
