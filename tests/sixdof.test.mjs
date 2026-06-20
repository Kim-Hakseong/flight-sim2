// Moment-based 6-DOF rotational dynamics unit tests (M8).
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.
//
// Aviation rate convention used by the moment model:
//   p = roll-right (right wing down) +,  q = pitch-up +,  r = yaw-right +
//   β = +  when the relative wind has a component toward the +X (right) wing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sideslipAngle,
  aeroMoments,
  bodyAngularAccel,
  sideForce,
  INERTIA,
  AERO_DERIV,
} from '../src/physics.js';

const closeTo = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const FWD = { x: 0, y: 0, z: -1 };   // nose
const RIGHT = { x: 1, y: 0, z: 0 };  // right wing

// zero-everything deriv set so each test can isolate one coefficient.
const Z = {
  Cm0: 0, Cm_alpha: 0, Cm_q: 0, Cm_de: 0,
  Cl_beta: 0, Cl_p: 0, Cl_da: 0,
  Cn_beta: 0, Cn_r: 0, Cn_dr: 0,
};
const GEOM = { qbar: 100, S: 16, span: 11, chord: 1.5, V: 50 };
const baseMoment = (over) =>
  aeroMoments({ ...GEOM, alpha: 0, beta: 0, p: 0, q: 0, r: 0,
    elevator: 0, aileron: 0, rudder: 0, deriv: Z, ...over });

// ---------- sideslipAngle ----------

test('sideslipAngle: zero when velocity is along the nose', () => {
  assert.ok(closeTo(sideslipAngle({ x: 0, y: 0, z: -50 }, FWD, RIGHT), 0));
});

test('sideslipAngle: positive when wind comes onto the right wing', () => {
  // velocity has a +right component → +β
  const b = sideslipAngle({ x: 10, y: 0, z: -50 }, FWD, RIGHT);
  assert.ok(b > 0, `expected +β, got ${b}`);
});

test('sideslipAngle: 45° when forward and side components are equal', () => {
  const b = sideslipAngle({ x: 30, y: 0, z: -30 }, FWD, RIGHT);
  assert.ok(closeTo(b, Math.PI / 4, 1e-6), `got ${b}`);
});

// ---------- aeroMoments: sign of each derivative ----------

test('aeroMoments: pitch stiffness — +alpha gives nose-down (M<0) when Cm_alpha<0', () => {
  const m = baseMoment({ alpha: 0.1, deriv: { ...Z, Cm_alpha: -0.7 } });
  assert.ok(m.M < 0, `got M=${m.M}`);
});

test('aeroMoments: elevator — +elevator gives nose-up (M>0)', () => {
  const m = baseMoment({ elevator: 0.5, deriv: { ...Z, Cm_de: 1.2 } });
  assert.ok(m.M > 0, `got M=${m.M}`);
});

test('aeroMoments: pitch damping — +q gives opposing (M<0) when Cm_q<0', () => {
  const m = baseMoment({ q: 0.3, deriv: { ...Z, Cm_q: -12 } });
  assert.ok(m.M < 0, `got M=${m.M}`);
});

test('aeroMoments: aileron — +aileron gives roll-right (L>0)', () => {
  const m = baseMoment({ aileron: 0.5, deriv: { ...Z, Cl_da: 0.1 } });
  assert.ok(m.L > 0, `got L=${m.L}`);
});

test('aeroMoments: dihedral — +beta gives roll-left (L<0) when Cl_beta<0', () => {
  const m = baseMoment({ beta: 0.1, deriv: { ...Z, Cl_beta: -0.1 } });
  assert.ok(m.L < 0, `got L=${m.L}`);
});

test('aeroMoments: weathercock — +beta gives yaw-right (N>0) when Cn_beta>0', () => {
  const m = baseMoment({ beta: 0.1, deriv: { ...Z, Cn_beta: 0.12 } });
  assert.ok(m.N > 0, `got N=${m.N}`);
});

test('aeroMoments: yaw damping — +r gives opposing (N<0) when Cn_r<0', () => {
  const m = baseMoment({ r: 0.3, deriv: { ...Z, Cn_r: -0.15 } });
  assert.ok(m.N < 0, `got N=${m.N}`);
});

test('aeroMoments: no dynamic pressure → no moments', () => {
  const m = aeroMoments({ ...GEOM, qbar: 0, alpha: 0.2, beta: 0.2, p: 1, q: 1, r: 1,
    elevator: 1, aileron: 1, rudder: 1, deriv: AERO_DERIV });
  assert.ok(closeTo(m.L, 0) && closeTo(m.M, 0) && closeTo(m.N, 0));
});

test('aeroMoments: pitch moment scales linearly with dynamic pressure', () => {
  const m1 = baseMoment({ elevator: 1, qbar: 100, deriv: { ...Z, Cm_de: 1.2 } });
  const m2 = baseMoment({ elevator: 1, qbar: 200, deriv: { ...Z, Cm_de: 1.2 } });
  assert.ok(closeTo(m2.M, 2 * m1.M, 1e-6), `${m2.M} vs 2*${m1.M}`);
});

// ---------- bodyAngularAccel: Euler's rigid-body equation ----------

test('bodyAngularAccel: diagonal inertia, zero rate → moment / inertia', () => {
  const I = { Ixx: 1300, Iyy: 1800, Izz: 2700, Ixz: 0 };
  const a = bodyAngularAccel({ p: 0, q: 0, r: 0 }, { L: 1300, M: 1800, N: 2700 }, I);
  assert.ok(closeTo(a.dp, 1) && closeTo(a.dq, 1) && closeTo(a.dr, 1));
});

test('bodyAngularAccel: gyroscopic coupling drives pitch from roll×yaw', () => {
  // diagonal I, no moment: dq = (Izz - Ixx)·p·r / Iyy
  const I = { Ixx: 1000, Iyy: 2000, Izz: 3000, Ixz: 0 };
  const p = 0.5, r = 0.4;
  const a = bodyAngularAccel({ p, q: 0, r }, { L: 0, M: 0, N: 0 }, I);
  const expected = (I.Izz - I.Ixx) * p * r / I.Iyy;
  assert.ok(closeTo(a.dq, expected, 1e-9), `dq=${a.dq} expected=${expected}`);
  assert.ok(closeTo(a.dp, 0) && closeTo(a.dr, 0), 'no roll/yaw accel for this case');
});

test('bodyAngularAccel: spin about a principal axis is steady (no torque)', () => {
  const I = { Ixx: 1000, Iyy: 2000, Izz: 3000, Ixz: 0 };
  const a = bodyAngularAccel({ p: 1.2, q: 0, r: 0 }, { L: 0, M: 0, N: 0 }, I);
  assert.ok(closeTo(a.dp, 0) && closeTo(a.dq, 0) && closeTo(a.dr, 0));
});

test('bodyAngularAccel: Ixz coupling — pure roll moment also yaws', () => {
  const I = { Ixx: 1000, Iyy: 2000, Izz: 3000, Ixz: 200 };
  const a = bodyAngularAccel({ p: 0, q: 0, r: 0 }, { L: 500, M: 0, N: 0 }, I);
  const det = I.Ixx * I.Izz - I.Ixz * I.Ixz;
  assert.ok(closeTo(a.dp, I.Izz * 500 / det, 1e-9), `dp=${a.dp}`);
  assert.ok(closeTo(a.dr, -I.Ixz * 500 / det, 1e-9), `dr=${a.dr}`);
  assert.ok(a.dr !== 0, 'Ixz must couple roll into yaw');
});

test('bodyAngularAccel: pure — does not mutate inputs', () => {
  const omega = { p: 0.1, q: 0.2, r: 0.3 };
  const moment = { L: 1, M: 2, N: 3 };
  bodyAngularAccel(omega, moment, INERTIA);
  assert.deepEqual(omega, { p: 0.1, q: 0.2, r: 0.3 });
  assert.deepEqual(moment, { L: 1, M: 2, N: 3 });
});

// ---------- sideForce: lateral aerodynamic force (M8-follow) ----------

test('sideForce: +beta gives a force opposing the slip (negative) when CY_beta<0', () => {
  // +β = velocity drifting toward +right wing → side force should push −right.
  const Y = sideForce({ qbar: 100, S: 16, beta: 0.1, deriv: { CY_beta: -0.3 } });
  assert.ok(Y < 0, `expected restoring (−) side force, got ${Y}`);
});

test('sideForce: zero sideslip → zero force', () => {
  assert.ok(closeTo(sideForce({ qbar: 100, S: 16, beta: 0, deriv: { CY_beta: -0.3 } }), 0));
});

test('sideForce: no dynamic pressure → zero force', () => {
  assert.ok(closeTo(sideForce({ qbar: 0, S: 16, beta: 0.2, deriv: { CY_beta: -0.3 } }), 0));
});

test('sideForce: scales linearly with dynamic pressure', () => {
  const y1 = sideForce({ qbar: 100, S: 16, beta: 0.1, deriv: { CY_beta: -0.3 } });
  const y2 = sideForce({ qbar: 200, S: 16, beta: 0.1, deriv: { CY_beta: -0.3 } });
  assert.ok(closeTo(y2, 2 * y1, 1e-9), `${y2} vs 2*${y1}`);
});

test('AERO_DERIV: side-force derivative is stabilizing (CY_beta < 0)', () => {
  assert.ok(AERO_DERIV.CY_beta < 0);
});

// ---------- default airframe sanity ----------

test('INERTIA: physically plausible light-aircraft tensor (Iyy largest of pitch axis)', () => {
  assert.ok(INERTIA.Ixx > 0 && INERTIA.Iyy > 0 && INERTIA.Izz > 0);
  assert.ok(INERTIA.Izz >= INERTIA.Ixx, 'yaw inertia ≥ roll inertia for a winged aircraft');
});

test('AERO_DERIV: statically stable signs (Cm_alpha<0, Cn_beta>0, Cl_beta<0)', () => {
  assert.ok(AERO_DERIV.Cm_alpha < 0, 'pitch stiffness');
  assert.ok(AERO_DERIV.Cn_beta > 0, 'directional/weathercock stiffness');
  assert.ok(AERO_DERIV.Cl_beta < 0, 'dihedral effect');
  assert.ok(AERO_DERIV.Cm_q < 0 && AERO_DERIV.Cn_r < 0 && AERO_DERIV.Cl_p < 0, 'damping');
});
