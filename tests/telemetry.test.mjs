// Telemetry payload merge tests (M10). The bridge maps t.x→lon, t.z→lat,
// t.altitude→alt, so sending the MEASURED (sensor) values instead of truth makes
// sensor faults — GPS jamming/bias/freeze — show up in QGroundControl.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeMeasuredIntoTelemetry } from '../src/telemetry.js';

const closeTo = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const D2R = Math.PI / 180;

const truth = {
  x: 10, y: 5, z: 20,
  vx: 1, vy: 2, vz: 3,
  speed: 50, altitude: 100,
  rollRad: 0.1, pitchRad: 0.2, yawRad: 0.3, headingDeg: 90,
  throttle01: 0.5, vsi: 1, missionSeq: -1,
};
const measured = {
  gpsX: 1010, gpsZ: 18, altitude: 102, airspeed: 49,
  roll: 6, pitch: 12, heading: 92, p: 1, q: 2, r: 3,
  _truth: { gpsX: 10 },
};

test('mergeMeasuredIntoTelemetry: no measured → returns a copy of truth', () => {
  assert.deepEqual(mergeMeasuredIntoTelemetry(truth, null), truth);
  assert.deepEqual(mergeMeasuredIntoTelemetry(truth, {}), truth);
});

test('mergeMeasuredIntoTelemetry: GPS position comes from the GPS sensor', () => {
  const m = mergeMeasuredIntoTelemetry(truth, measured);
  assert.equal(m.x, 1010);
  assert.equal(m.z, 18);
});

test('mergeMeasuredIntoTelemetry: altitude and speed come from sensors', () => {
  const m = mergeMeasuredIntoTelemetry(truth, measured);
  assert.equal(m.altitude, 102);
  assert.equal(m.speed, 49);
});

test('mergeMeasuredIntoTelemetry: attitude is converted from sensor degrees to radians', () => {
  const m = mergeMeasuredIntoTelemetry(truth, measured);
  assert.ok(closeTo(m.rollRad, 6 * D2R));
  assert.ok(closeTo(m.pitchRad, 12 * D2R));
  assert.equal(m.headingDeg, 92);
});

test('mergeMeasuredIntoTelemetry: truth-only fields are preserved', () => {
  const m = mergeMeasuredIntoTelemetry(truth, measured);
  assert.equal(m.vx, 1); assert.equal(m.vy, 2); assert.equal(m.vz, 3);
  assert.equal(m.vsi, 1); assert.equal(m.throttle01, 0.5); assert.equal(m.y, 5);
});

test('mergeMeasuredIntoTelemetry: a GPS jam/bias propagates to the position field', () => {
  const jammed = { ...measured, gpsX: 999999 }; // huge offset = spoof/bias
  const m = mergeMeasuredIntoTelemetry(truth, jammed);
  assert.equal(m.x, 999999, 'faulted GPS must reach the telemetry position');
});

test('mergeMeasuredIntoTelemetry: pure — does not mutate inputs', () => {
  const t = { ...truth }, mm = { ...measured };
  mergeMeasuredIntoTelemetry(t, mm);
  assert.deepEqual(t, truth);
  assert.deepEqual(mm, measured);
});
