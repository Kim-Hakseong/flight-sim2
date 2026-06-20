// Sensor model unit tests (M9). A sensor turns a truth value into a measured
// value: scale-factor + bias + Gaussian noise + first-order lag, plus injected
// faults (frozen / dropout / bias-jump). Noise uses a SEEDED PRNG so the whole
// thing stays deterministic (M7) — no Math.random.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, gaussian, stepSensor } from '../src/sensors.js';

const closeTo = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- seeded PRNG ----------

test('makeRng: same seed produces the same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('makeRng: different seeds diverge', () => {
  const a = makeRng(1), b = makeRng(2);
  assert.notEqual(a(), b());
});

test('makeRng: stays within [0,1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
  }
});

test('gaussian: seeded mean is approximately zero over many samples', () => {
  const r = makeRng(123);
  let sum = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) sum += gaussian(r);
  assert.ok(Math.abs(sum / N) < 0.05, `mean=${sum / N}`);
});

// ---------- stepSensor ----------

const ideal = { scale: 1, bias: 0, noise: 0, bandwidth: Infinity };

test('stepSensor: ideal sensor reports truth exactly', () => {
  const r = makeRng(1);
  assert.ok(closeTo(stepSensor(0, 100, 0.02, ideal, r), 100));
});

test('stepSensor: bias offsets the measurement', () => {
  const r = makeRng(1);
  const m = stepSensor(0, 100, 0.02, { ...ideal, bias: 3 }, r);
  assert.ok(closeTo(m, 103));
});

test('stepSensor: scale factor scales the measurement', () => {
  const r = makeRng(1);
  const m = stepSensor(0, 100, 0.02, { ...ideal, scale: 1.02 }, r);
  assert.ok(closeTo(m, 102));
});

test('stepSensor: first-order lag approaches truth but not instantly', () => {
  const r = makeRng(1);
  const m1 = stepSensor(0, 100, 0.02, { ...ideal, bandwidth: 5 }, r);
  assert.ok(m1 > 0 && m1 < 100, `partial move expected, got ${m1}`);
  let m = m1;
  for (let i = 0; i < 500; i++) m = stepSensor(m, 100, 0.02, { ...ideal, bandwidth: 5 }, r);
  assert.ok(Math.abs(m - 100) < 1e-3, `should converge, got ${m}`);
});

test('stepSensor: noise is deterministic for a given seed', () => {
  const m1 = stepSensor(0, 50, 0.02, { ...ideal, noise: 2 }, makeRng(99));
  const m2 = stepSensor(0, 50, 0.02, { ...ideal, noise: 2 }, makeRng(99));
  assert.equal(m1, m2);
  assert.notEqual(m1, 50); // noise actually perturbed it
});

test('stepSensor: frozen fault holds the previous value', () => {
  const r = makeRng(1);
  const m = stepSensor(42, 100, 0.02, ideal, r, { type: 'frozen' });
  assert.ok(closeTo(m, 42));
});

test('stepSensor: dropout fault flatlines at the configured value', () => {
  const r = makeRng(1);
  const m = stepSensor(42, 100, 0.02, ideal, r, { type: 'dropout', value: 0 });
  assert.ok(closeTo(m, 0));
});

test('stepSensor: bias-jump fault adds a step error', () => {
  const r = makeRng(1);
  const m = stepSensor(0, 100, 0.02, ideal, r, { type: 'bias', value: 25 });
  assert.ok(closeTo(m, 125));
});

test('stepSensor: bias fault is a fixed offset, not a per-call runaway', () => {
  // With a lagged sensor, repeatedly applying the bias must converge to
  // truth + value — NOT accumulate the bias every frame.
  const r = makeRng(1);
  let m = 0;
  const cfg = { scale: 1, bias: 0, noise: 0, bandwidth: 6 };
  for (let i = 0; i < 3000; i++) m = stepSensor(m, 100, 0.02, cfg, r, { type: 'bias', value: 10 });
  assert.ok(closeTo(m, 110, 1e-3), `expected 110, got ${m}`);
});

test('stepSensor: does not mutate cfg or fault', () => {
  const cfg = { scale: 1.01, bias: 2, noise: 1, bandwidth: 10 };
  const fault = { type: 'bias', value: 5 };
  const cfgCopy = JSON.parse(JSON.stringify(cfg));
  const faultCopy = JSON.parse(JSON.stringify(fault));
  stepSensor(0, 10, 0.02, cfg, makeRng(3), fault);
  assert.deepEqual(cfg, cfgCopy);
  assert.deepEqual(fault, faultCopy);
});
