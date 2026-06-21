// Wind model unit tests (M22). Wind is the velocity of the AIR (world frame);
// aerodynamics use (aircraft velocity − wind). Steady wind + first-order (OU)
// turbulence gives realistic, bounded, deterministic gusts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { windStep, shearFactor } from '../src/wind.js';
import { makeRng } from '../src/sensors.js';

const closeTo = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const STEADY = { x: 6, y: 0, z: -3 };

test('windStep: zero turbulence → wind equals the steady wind', () => {
  const r = windStep(STEADY, { x: 0, y: 0, z: 0 }, 0.02, makeRng(1), 0);
  assert.ok(closeTo(r.wind.x, 6) && closeTo(r.wind.y, 0) && closeTo(r.wind.z, -3));
  assert.ok(closeTo(r.gust.x, 0) && closeTo(r.gust.z, 0));
});

test('windStep: turbulence perturbs the wind around the steady value', () => {
  let gust = { x: 0, y: 0, z: 0 };
  const rng = makeRng(7);
  let perturbed = false;
  for (let i = 0; i < 50; i++) {
    const r = windStep(STEADY, gust, 0.02, rng, 3);
    gust = r.gust;
    if (Math.abs(r.wind.x - STEADY.x) > 0.2) perturbed = true;
  }
  assert.ok(perturbed, 'gusts should move the wind off the steady value');
});

test('windStep: gusts stay bounded (OU process does not run away)', () => {
  let gust = { x: 0, y: 0, z: 0 };
  const rng = makeRng(3);
  let maxMag = 0;
  for (let i = 0; i < 3000; i++) {
    const r = windStep(STEADY, gust, 0.02, rng, 3);
    gust = r.gust;
    maxMag = Math.max(maxMag, Math.hypot(gust.x, gust.y, gust.z));
  }
  assert.ok(maxMag < 30, `gust magnitude should stay bounded, peaked at ${maxMag}`);
});

test('windStep: deterministic for a given seed', () => {
  const a = windStep(STEADY, { x: 1, y: 0, z: 0 }, 0.02, makeRng(42), 3);
  const b = windStep(STEADY, { x: 1, y: 0, z: 0 }, 0.02, makeRng(42), 3);
  assert.deepEqual(a, b);
});

test('windStep: pure — does not mutate the inputs', () => {
  const steady = { x: 6, y: 0, z: -3 };
  const gust = { x: 1, y: 0, z: 0 };
  windStep(steady, gust, 0.02, makeRng(1), 3);
  assert.deepEqual(steady, { x: 6, y: 0, z: -3 });
  assert.deepEqual(gust, { x: 1, y: 0, z: 0 });
});

// Boundary-layer wind shear: surface friction makes wind ≈0 at the ground and
// build to full strength aloft. Keeps the ground roll calm (no tire model needed)
// and reproduces real approach wind-shear; near touchdown the wind eases off.
test('shearFactor: zero at (and below) the surface', () => {
  assert.equal(shearFactor(0, 40), 0);
  assert.equal(shearFactor(-5, 40), 0);
});

test('shearFactor: full wind at and above the reference height', () => {
  assert.equal(shearFactor(40, 40), 1);
  assert.equal(shearFactor(120, 40), 1);
});

test('shearFactor: monotonic ramp between surface and reference', () => {
  assert.ok(closeTo(shearFactor(20, 40), 0.5));
  assert.ok(shearFactor(10, 40) < shearFactor(30, 40));
});
