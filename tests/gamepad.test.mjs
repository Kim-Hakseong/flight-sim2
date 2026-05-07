// Gamepad axis helpers — pure functions only (no navigator).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyDeadzone, mapAxes } from '../src/gamepad.js';

test('applyDeadzone: |v| < deadzone → 0', () => {
  assert.equal(applyDeadzone(0, 0.1), 0);
  assert.equal(applyDeadzone(0.05, 0.1), 0);
  assert.equal(applyDeadzone(-0.05, 0.1), 0);
});

test('applyDeadzone: outside deadzone is rescaled to full [-1, 1] range', () => {
  // Just past the deadzone should be near 0, full range stays 1.
  const tiny = applyDeadzone(0.11, 0.1);
  const full = applyDeadzone(1.0,  0.1);
  assert.ok(Math.abs(tiny) < 0.05, `expected near zero, got ${tiny}`);
  assert.ok(Math.abs(full - 1.0) < 1e-6);
});

test('applyDeadzone: symmetric for negative values', () => {
  const a = applyDeadzone(0.5,  0.1);
  const b = applyDeadzone(-0.5, 0.1);
  assert.ok(Math.abs(a + b) < 1e-6, 'should be opposite-signed');
});

test('mapAxes: pitch invert default — stick forward (axis1 = -1) → pitch +1', () => {
  const pad = {
    axes: [0, -1, 0, 0],
    buttons: [],
  };
  const r = mapAxes(pad);
  assert.ok(Math.abs(r.pitch - 1.0) < 1e-6, 'forward stick → pitch up');
});

test('mapAxes: triggers (buttons 6/7) → throttle when present', () => {
  const pad = {
    axes: [0, 0, 0, 0],
    buttons: [
      { value: 0 }, { value: 0 }, { value: 0 }, { value: 0 },
      { value: 0 }, { value: 0 },
      { value: 0 },        // LT off
      { value: 0.8 },      // RT pressed
    ],
  };
  const r = mapAxes(pad);
  assert.ok(Math.abs(r.throttle - 0.8) < 1e-6);
});

test('mapAxes: axes 0..2 → roll/pitch/yaw with deadzone', () => {
  const pad = {
    axes: [0.02, 0, 0.5, 0],   // axis 0 inside deadzone, axis 2 active
    buttons: [],
  };
  const r = mapAxes(pad);
  assert.equal(r.roll, 0);              // squelched by deadzone
  assert.ok(Math.abs(r.yaw - 0.5) < 0.06); // rescaled around the deadzone
});

test('mapAxes: throttle slider on axis 3 fallback when no triggers', () => {
  const pad = {
    axes: [0, 0, 0, -1],   // throttle slider all the way "forward" (max)
    buttons: [],
  };
  const r = mapAxes(pad);
  assert.ok(Math.abs(r.throttle - 1.0) < 0.05, `expected 1.0, got ${r.throttle}`);
});

test('mapAxes: returns null fields when nothing significant is moved', () => {
  const pad = { axes: [0, 0, 0, 0], buttons: [] };
  const r = mapAxes(pad);
  assert.equal(r.roll, 0);
  assert.equal(r.pitch, 0);
  assert.equal(r.yaw, 0);
  assert.equal(r.throttle, null);
});
