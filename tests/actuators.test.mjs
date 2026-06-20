// Actuator model unit tests (M9). A control-surface actuator sits between the
// commanded deflection (pilot/autopilot) and the deflection the airframe
// actually sees: rate-limited, bandwidth-limited, position-limited, and
// subject to injected faults (stuck / offset / float / slow).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stepActuator } from '../src/actuators.js';

const closeTo = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Drive an actuator to steady state under a constant command.
function settle(command, cfg, fault, steps = 2000, dt = 0.005) {
  let pos = 0;
  for (let i = 0; i < steps; i++) pos = stepActuator(pos, command, dt, cfg, fault);
  return pos;
}

test('stepActuator: tracks a constant command to steady state', () => {
  const pos = settle(0.7, { bandwidth: 30, rateLimit: Infinity });
  assert.ok(closeTo(pos, 0.7, 1e-3), `got ${pos}`);
});

test('stepActuator: first-order lag — does not jump instantly to the command', () => {
  const pos = stepActuator(0, 1, 0.005, { bandwidth: 30, rateLimit: Infinity });
  assert.ok(pos > 0 && pos < 1, `expected partial move, got ${pos}`);
});

test('stepActuator: rate limit caps the slew per step', () => {
  const rateLimit = 2; // units/s
  const dt = 0.005;
  const pos = stepActuator(0, 1, dt, { bandwidth: Infinity, rateLimit });
  assert.ok(closeTo(pos, rateLimit * dt, 1e-9), `got ${pos}`);
});

test('stepActuator: position limit clamps beyond travel', () => {
  const pos = settle(5, { bandwidth: 30, rateLimit: Infinity, min: -1, max: 1 });
  assert.ok(closeTo(pos, 1, 1e-6), `got ${pos}`);
});

test('stepActuator: stuck fault freezes the surface regardless of command', () => {
  const frozen = 0.3;
  const pos = stepActuator(frozen, 1, 0.005, { bandwidth: 30 }, { type: 'stuck' });
  assert.ok(closeTo(pos, frozen), `got ${pos}`);
});

test('stepActuator: offset fault biases the steady-state position', () => {
  const pos = settle(0.2, { bandwidth: 30, rateLimit: Infinity, min: -1, max: 1 }, { type: 'offset', value: 0.1 });
  assert.ok(closeTo(pos, 0.3, 1e-3), `got ${pos}`);
});

test('stepActuator: float fault drives the surface toward neutral despite command', () => {
  const pos = settle(1, { bandwidth: 30, rateLimit: Infinity }, { type: 'float' });
  assert.ok(closeTo(pos, 0, 1e-3), `got ${pos}`);
});

test('stepActuator: pure — does not mutate cfg or fault', () => {
  const cfg = { bandwidth: 30, rateLimit: 5, min: -1, max: 1 };
  const fault = { type: 'offset', value: 0.1 };
  const cfgCopy = JSON.parse(JSON.stringify(cfg));
  const faultCopy = JSON.parse(JSON.stringify(fault));
  stepActuator(0, 0.5, 0.005, cfg, fault);
  assert.deepEqual(cfg, cfgCopy);
  assert.deepEqual(fault, faultCopy);
});

test('stepActuator: deterministic — identical inputs give identical output', () => {
  const a = stepActuator(0.1, 0.8, 0.005, { bandwidth: 25, rateLimit: 4 });
  const b = stepActuator(0.1, 0.8, 0.005, { bandwidth: 25, rateLimit: 4 });
  assert.equal(a, b);
});
