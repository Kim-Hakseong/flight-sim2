// Damage state machine tests — pure functions over a plain state object.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDamageState,
  applyHit,
  liftMultiplier,
  thrustMultiplier,
  controlMultiplier,
  isCrashed,
  totalIntegrity,
} from '../src/damage.js';

test('createDamageState: pristine — every component at 1.0', () => {
  const s = createDamageState();
  assert.equal(s.fuselage, 1.0);
  assert.equal(s.leftWing, 1.0);
  assert.equal(s.rightWing, 1.0);
  assert.equal(s.tail, 1.0);
  assert.equal(s.engine, 1.0);
  assert.equal(isCrashed(s), false);
});

test('applyHit: reduces a single component, clamped at 0', () => {
  const s = createDamageState();
  applyHit(s, 'leftWing', 0.3);
  assert.ok(Math.abs(s.leftWing - 0.7) < 1e-6);
  applyHit(s, 'leftWing', 1.0);
  assert.equal(s.leftWing, 0);
});

test('applyHit: fuselage destruction triggers crash flag', () => {
  const s = createDamageState();
  applyHit(s, 'fuselage', 0.5);
  assert.equal(isCrashed(s), false);
  applyHit(s, 'fuselage', 0.5);
  assert.equal(isCrashed(s), true);
});

test('liftMultiplier: returns wing HP per side', () => {
  const s = createDamageState();
  applyHit(s, 'leftWing', 0.4);
  assert.ok(Math.abs(liftMultiplier(s, 'left')  - 0.6) < 1e-6);
  assert.ok(Math.abs(liftMultiplier(s, 'right') - 1.0) < 1e-6);
});

test('thrustMultiplier: scales with engine HP', () => {
  const s = createDamageState();
  assert.equal(thrustMultiplier(s), 1.0);
  applyHit(s, 'engine', 0.7);
  assert.ok(Math.abs(thrustMultiplier(s) - 0.3) < 1e-6);
});

test('controlMultiplier: never zero (residual aerodynamic stability)', () => {
  const s = createDamageState();
  applyHit(s, 'tail', 1.0);
  // Even with the tail destroyed, expect a small residual >= 0.2 so the
  // simulation stays integrable rather than locking up.
  assert.ok(controlMultiplier(s) >= 0.2);
});

test('totalIntegrity: average of all components', () => {
  const s = createDamageState();
  assert.equal(totalIntegrity(s), 1.0);
  applyHit(s, 'leftWing', 0.5);
  applyHit(s, 'engine', 0.5);
  // 5 components, each 1.0 except 2 at 0.5 → (3 + 0.5 + 0.5)/5 = 0.8
  assert.ok(Math.abs(totalIntegrity(s) - 0.8) < 1e-6);
});
