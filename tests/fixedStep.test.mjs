// Fixed-step scheduler + integrator unit tests (M7).
// Determinism is the point: same input sequence → same number of fixed steps,
// regardless of how the wall-clock frames are partitioned.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planSteps,
  rk4Step,
  DT_PHYS,
  MAX_SUBSTEPS,
  PHYS_HZ,
} from '../src/fixedStep.js';

const closeTo = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

// ---------- constants ----------

test('DT_PHYS is the reciprocal of PHYS_HZ', () => {
  assert.ok(PHYS_HZ > 0);
  assert.ok(closeTo(DT_PHYS, 1 / PHYS_HZ, 1e-12));
});

// ---------- planSteps: scheduling ----------

test('planSteps: less than one step carries the whole accumulation forward', () => {
  const dt = DT_PHYS;
  const acc = dt * 0.4;
  const p = planSteps(acc, dt, MAX_SUBSTEPS);
  assert.equal(p.steps, 0);
  assert.ok(closeTo(p.remainder, acc, 1e-9), 'remainder carries forward');
  assert.ok(closeTo(p.alpha, 0.4, 1e-6), 'alpha = remainder / dt');
});

test('planSteps: exactly one step at the boundary (fp-robust)', () => {
  const dt = DT_PHYS;
  const p = planSteps(dt, dt, MAX_SUBSTEPS);
  assert.equal(p.steps, 1, 'accumulated == dt must yield exactly one step');
  assert.ok(closeTo(p.remainder, 0, 1e-9), 'no leftover at the boundary');
});

test('planSteps: multiple steps with fractional remainder', () => {
  const dt = DT_PHYS;
  const p = planSteps(dt * 2.5, dt, MAX_SUBSTEPS);
  assert.equal(p.steps, 2);
  assert.ok(closeTo(p.remainder, dt * 0.5, 1e-9));
  assert.ok(closeTo(p.alpha, 0.5, 1e-6));
});

test('planSteps: spiral-of-death guard clamps steps and reports dropped time', () => {
  const dt = DT_PHYS;
  const over = 10;
  const p = planSteps(dt * (MAX_SUBSTEPS + over), dt, MAX_SUBSTEPS);
  assert.equal(p.steps, MAX_SUBSTEPS, 'steps clamped to MAX_SUBSTEPS');
  assert.ok(closeTo(p.dropped, dt * over, 1e-9), 'overflow time is shed, not run');
});

test('planSteps: non-positive / NaN accumulation is a no-op, never throws', () => {
  for (const bad of [0, -1, NaN, undefined]) {
    const p = planSteps(bad, DT_PHYS, MAX_SUBSTEPS);
    assert.equal(p.steps, 0);
    assert.equal(p.dropped, 0);
    assert.ok(p.remainder >= 0);
  }
});

test('planSteps: is pure — identical inputs give identical outputs', () => {
  const a = planSteps(DT_PHYS * 3.3, DT_PHYS, MAX_SUBSTEPS);
  const b = planSteps(DT_PHYS * 3.3, DT_PHYS, MAX_SUBSTEPS);
  assert.deepEqual(a, b);
});

test('planSteps: render-rate independence — different frame partitions, same total steps', () => {
  // Drive the same total sim-time two ways: one big frame vs many small frames.
  const dt = DT_PHYS;
  const total = dt * 12; // 12 fixed steps worth of time

  const runFrames = (frameDts) => {
    let acc = 0;
    let steps = 0;
    for (const f of frameDts) {
      acc += f;
      const p = planSteps(acc, dt, MAX_SUBSTEPS);
      acc = p.remainder;
      steps += p.steps;
    }
    return steps;
  };

  const oneBigFrame = runFrames([total]);
  const twelveSmallFrames = runFrames(Array(12).fill(dt));
  const jittery = runFrames([dt * 0.3, dt * 5.1, dt * 1.0, dt * 2.2, dt * 3.4]); // sums to 12*dt

  assert.equal(oneBigFrame, 12);
  assert.equal(twelveSmallFrames, 12);
  assert.equal(jittery, 12, 'jittery frame timing must not change total steps');
});

// ---------- rk4Step: integrator ----------

test('rk4Step: exponential decay y\'=-y matches e^-t', () => {
  // y(1) = e^-1 ≈ 0.367879
  const f = (_t, y) => [-y[0]];
  let y = [1];
  const dt = 0.01;
  for (let i = 0; i < 100; i++) y = rk4Step(y, i * dt, dt, f);
  assert.ok(closeTo(y[0], Math.exp(-1), 1e-6), `got ${y[0]}`);
});

test('rk4Step: harmonic oscillator matches cos/sin after half a period', () => {
  // x'' = -x  →  state [x, v], integrate to t = π: x≈-1, v≈0
  const f = (_t, y) => [y[1], -y[0]];
  let y = [1, 0];
  const dt = 0.001;
  const n = Math.round(Math.PI / dt);
  for (let i = 0; i < n; i++) y = rk4Step(y, i * dt, dt, f);
  assert.ok(closeTo(y[0], -1, 1e-3), `x got ${y[0]}`);
  assert.ok(closeTo(y[1], 0, 1e-3), `v got ${y[1]}`);
});

test('rk4Step: deterministic — identical args give identical output', () => {
  const f = (_t, y) => [y[1], -y[0]];
  const a = rk4Step([1, 0], 0, 0.01, f);
  const b = rk4Step([1, 0], 0, 0.01, f);
  assert.deepEqual(a, b);
});

test('rk4Step: pure — does not mutate the input state vector', () => {
  const f = (_t, y) => [-y[0]];
  const y0 = [1];
  rk4Step(y0, 0, 0.01, f);
  assert.deepEqual(y0, [1], 'input array must be untouched');
});
