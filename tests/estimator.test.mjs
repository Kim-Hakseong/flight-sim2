// Estimator unit tests (M11). A constant-velocity 1-D Kalman filter fuses noisy
// position measurements (e.g. GPS) into a smoother position+velocity estimate,
// and a first-order low-pass cleans angle/rate channels — so the autopilot can
// fly on sensor data (sensor-in-the-loop) without chattering on noise.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createKF, kfStep, kfStepGated, lowpassStep } from '../src/estimator.js';
import { makeRng, gaussian } from '../src/sensors.js';

const closeTo = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('createKF: seeds position and velocity', () => {
  const s = createKF(5, 2);
  assert.equal(s.x, 5);
  assert.equal(s.v, 2);
});

test('kfStep: converges to a constant truth under noise', () => {
  const rng = makeRng(2025);
  let s = createKF(0, 0);
  const truth = 100;
  for (let i = 0; i < 800; i++) {
    s = kfStep(s, truth + gaussian(rng) * 2, 0.05, { q: 0.5, r: 4 });
  }
  assert.ok(Math.abs(s.x - truth) < 0.8, `estimate ${s.x} should sit near ${truth}`);
});

test('kfStep: estimate is smoother than the raw measurements', () => {
  const rng = makeRng(7);
  let s = createKF(50, 0);
  let sumEstErr = 0, sumRawErr = 0;
  const N = 600;
  for (let i = 0; i < N; i++) {
    const z = 50 + gaussian(rng) * 3;   // σ=3 raw
    s = kfStep(s, z, 0.05, { q: 0.2, r: 9 });
    sumRawErr += Math.abs(z - 50);
    sumEstErr += Math.abs(s.x - 50);
  }
  assert.ok(sumEstErr < sumRawErr * 0.6, `filter should cut noise: est ${sumEstErr} vs raw ${sumRawErr}`);
});

test('kfStep: tracks a constant-velocity ramp', () => {
  let s = createKF(0, 0);
  const v0 = 5, dt = 0.05;
  for (let i = 0; i < 1000; i++) s = kfStep(s, v0 * i * dt, dt, { q: 1, r: 1 });
  assert.ok(Math.abs(s.v - v0) < 0.2, `velocity estimate ${s.v} should approach ${v0}`);
});

test('kfStep: covariance shrinks as measurements arrive', () => {
  let s = createKF(0, 0);
  const p0 = s.P00;
  for (let i = 0; i < 50; i++) s = kfStep(s, 10, 0.05, { q: 0.1, r: 2 });
  assert.ok(s.P00 < p0, `P00 ${s.P00} should drop below ${p0}`);
});

test('kfStep: pure — does not mutate the input state', () => {
  const s = createKF(1, 1);
  const snap = JSON.parse(JSON.stringify(s));
  kfStep(s, 5, 0.05, { q: 1, r: 1 });
  assert.deepEqual(s, snap);
});

// ---------- kfStepGated: fault detection & exclusion (M13) ----------

// Settle a gated filter on a constant truth so its covariance is small.
function settledGated(truth, cfg, steps = 60) {
  let s = createKF(truth, 0);
  for (let i = 0; i < steps; i++) s = kfStepGated(s, truth, 0.05, cfg);
  return s;
}

const GATE_CFG = { q: 0.5, r: 4, gate: 16 };

test('kfStepGated: accepts a normal measurement (not rejected)', () => {
  const s = settledGated(100, GATE_CFG);
  const out = kfStepGated(s, 100.6, 0.05, GATE_CFG);
  assert.equal(out.rejected, false);
  assert.ok(Math.abs(out.x - 100) < 1, `x ${out.x}`);
});

test('kfStepGated: rejects an outlier (GPS jump) and coasts instead of following it', () => {
  const s = settledGated(100, GATE_CFG);
  const out = kfStepGated(s, 10000, 0.05, GATE_CFG); // huge spoof/jump
  assert.equal(out.rejected, true);
  assert.ok(Math.abs(out.x - 100) < 5, `estimate must NOT jump to the spoof, got ${out.x}`);
});

test('kfStepGated: NIS is small for inliers, large for outliers', () => {
  const s = settledGated(50, GATE_CFG);
  const good = kfStepGated(s, 50.3, 0.05, GATE_CFG);
  const bad = kfStepGated(s, 5000, 0.05, GATE_CFG);
  assert.ok(good.nis < GATE_CFG.gate, `inlier NIS ${good.nis}`);
  assert.ok(bad.nis > GATE_CFG.gate, `outlier NIS ${bad.nis}`);
});

test('kfStepGated: recovers — tracks again once measurements return to normal', () => {
  let s = settledGated(100, GATE_CFG);
  s = kfStepGated(s, 9000, 0.05, GATE_CFG);          // outlier, rejected
  assert.equal(s.rejected, true);
  for (let i = 0; i < 40; i++) s = kfStepGated(s, 100, 0.05, GATE_CFG);
  assert.equal(s.rejected, false);
  assert.ok(Math.abs(s.x - 100) < 1, `should re-converge, got ${s.x}`);
});

test('kfStepGated: pure — does not mutate the input state', () => {
  const s = settledGated(10, GATE_CFG);
  const snap = JSON.parse(JSON.stringify(s));
  kfStepGated(s, 9999, 0.05, GATE_CFG);
  assert.deepEqual(s, snap);
});

test('lowpassStep: partial move toward the target', () => {
  const m = lowpassStep(0, 10, 0.05, 5);
  assert.ok(m > 0 && m < 10, `got ${m}`);
});

test('lowpassStep: converges to the target', () => {
  let m = 0;
  for (let i = 0; i < 500; i++) m = lowpassStep(m, 10, 0.05, 5);
  assert.ok(closeTo(m, 10, 1e-3), `got ${m}`);
});

test('lowpassStep: handles angle wrap is NOT its job — plain scalar only', () => {
  // documents intent: callers must pre-unwrap angles; lowpass is a scalar filter.
  assert.ok(closeTo(lowpassStep(5, 5, 0.05, 5), 5));
});
