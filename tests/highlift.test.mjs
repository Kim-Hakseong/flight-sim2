// High-lift devices (flaps + spoilers) unit tests (M21).
// Flaps add lift AND drag (slower flight, steeper sink); spoilers add drag and
// dump lift (descent + rollout braking).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { highLift, CL_FLAP, CD_FLAP, CD_SPOILER } from '../src/physics.js';

const closeTo = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('highLift: clean config (no devices) is unchanged', () => {
  const r = highLift(0.5, 0.03, 0, 0);
  assert.ok(closeTo(r.cl, 0.5) && closeTo(r.cd, 0.03));
});

test('highLift: flaps add lift and drag', () => {
  const r = highLift(0.5, 0.03, 1, 0);
  assert.ok(closeTo(r.cl, 0.5 + CL_FLAP), `cl ${r.cl}`);
  assert.ok(closeTo(r.cd, 0.03 + CD_FLAP), `cd ${r.cd}`);
  assert.ok(r.cl > 0.5 && r.cd > 0.03);
});

test('highLift: spoilers add drag and dump lift', () => {
  const r = highLift(0.8, 0.03, 0, 1);
  assert.ok(r.cd > 0.03 + CD_SPOILER - 1e-9, `cd ${r.cd}`);
  assert.ok(r.cl < 0.8, `spoilers should dump lift, got ${r.cl}`);
});

test('highLift: partial deflection scales linearly', () => {
  const half = highLift(0.5, 0.03, 0.5, 0);
  assert.ok(closeTo(half.cl, 0.5 + 0.5 * CL_FLAP) && closeTo(half.cd, 0.03 + 0.5 * CD_FLAP));
});

test('highLift: flaps lower the effective stall speed (more max lift)', () => {
  // Same dynamic pressure & weight: more CL available → can fly slower.
  const clean = highLift(1.5, 0.03, 0, 0).cl;
  const flapped = highLift(1.5, 0.03, 1, 0).cl;
  assert.ok(flapped > clean);
});
