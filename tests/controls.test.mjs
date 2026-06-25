// Keyboard input shaping (M42): a tap must not slam the surface to full, a held
// key must still reach full authority, releasing must return to centre, and the
// expo curve must soften the mid-range. Analog/AP axes must not be clobbered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createControlState, tickControls, expoShape, CONTROL_FEEL, axesFromKeys } from '../src/controls.js';

const DT = 1 / 60;

test('axesFromKeys maps WASD/QE to the right axes', () => {
  assert.deepEqual(axesFromKeys(new Set(['w'])), { pitch: 1, roll: 0, yaw: 0 });
  assert.deepEqual(axesFromKeys(new Set(['s'])), { pitch: -1, roll: 0, yaw: 0 });
  assert.deepEqual(axesFromKeys(new Set(['d'])), { pitch: 0, roll: 1, yaw: 0 });
  assert.deepEqual(axesFromKeys(new Set(['a'])), { pitch: 0, roll: -1, yaw: 0 });
  assert.deepEqual(axesFromKeys(new Set(['e'])), { pitch: 0, roll: 0, yaw: 1 });
  assert.deepEqual(axesFromKeys(new Set(['q'])), { pitch: 0, roll: 0, yaw: -1 });
});

test('arrow ←/→ are roll aliases (so the arrow cluster also banks)', () => {
  assert.equal(axesFromKeys(new Set(['arrowright'])).roll, 1, '→ rolls right like D');
  assert.equal(axesFromKeys(new Set(['arrowleft'])).roll, -1, '← rolls left like A');
  // ↑/↓ stay throttle-only — they must NOT touch the pitch/roll/yaw axes.
  assert.deepEqual(axesFromKeys(new Set(['arrowup'])), { pitch: 0, roll: 0, yaw: 0 });
  assert.deepEqual(axesFromKeys(new Set(['arrowdown'])), { pitch: 0, roll: 0, yaw: 0 });
});

test('expoShape softens mid-range but keeps the stops at full', () => {
  assert.equal(expoShape(0, 0.55), 0);
  assert.equal(expoShape(1, 0.55), 1);          // full deflection preserved
  assert.equal(expoShape(-1, 0.55), -1);
  assert.ok(expoShape(0.5, 0.55) < 0.5);        // gentler near centre
  assert.ok(expoShape(0.5, 0.55) > 0);
});

test('a single-frame tap does not reach full deflection', () => {
  const s = createControlState();
  s._kbTarget.roll = 1;                          // key pressed this frame
  tickControls(s, DT);
  assert.ok(s.roll > 0, 'some roll commanded');
  assert.ok(s.roll < 0.15, `tap stays small, got ${s.roll}`);
});

test('holding a key ramps to full authority', () => {
  const s = createControlState();
  s._kbTarget.pitch = 1;
  for (let i = 0; i < 60; i++) tickControls(s, DT); // 1.0 s held
  assert.ok(s.pitch > 0.99, `held key reaches full, got ${s.pitch}`);
});

test('releasing a key returns the command to centre', () => {
  const s = createControlState();
  s._kbTarget.yaw = -1;
  for (let i = 0; i < 60; i++) tickControls(s, DT); // ramp to full
  s._kbTarget.yaw = 0;                              // release
  for (let i = 0; i < 60; i++) tickControls(s, DT);
  assert.equal(s.yaw, 0, `recentred exactly, got ${s.yaw}`);
});

test('idle keyboard does not clobber an analog (touch/gamepad) command', () => {
  const s = createControlState();
  s.pitch = 0.7;                                  // e.g. touch joystick set it
  tickControls(s, DT);                            // no keys held, stick centred
  assert.equal(s.pitch, 0.7, 'analog axis left untouched');
});

test('ramp rate honours CONTROL_FEEL (tunable sensitivity)', () => {
  const saved = { ...CONTROL_FEEL };
  CONTROL_FEEL.rampUp = 1.0; CONTROL_FEEL.expo = 0; // linear, slow
  const s = createControlState();
  s._kbTarget.roll = 1;
  tickControls(s, DT);
  assert.ok(Math.abs(s.roll - 1.0 * DT) < 1e-9, `linear ramp = rampUp*dt, got ${s.roll}`);
  Object.assign(CONTROL_FEEL, saved);             // restore for other tests
});
