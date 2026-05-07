// Collision tests: pure sphere-vs-box and sphere-vs-cone helpers.
// COORDINATE: world-frame +Y up. AABBs are axis-aligned bounding boxes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sphereVsBox,
  sphereVsCone,
  classifyHit,
} from '../src/collision.js';

test('sphereVsBox: sphere far away → no hit', () => {
  const hit = sphereVsBox({ x: 100, y: 0, z: 0 }, 5, { cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 });
  assert.equal(hit, null);
});

test('sphereVsBox: sphere overlapping → hit with depth and normal', () => {
  const hit = sphereVsBox({ x: 1.4, y: 0, z: 0 }, 1, { cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 });
  assert.ok(hit, 'expected a hit');
  // Sphere center is 0.4m past the +X face, so it's penetrated by 0.6m
  assert.ok(hit.depth > 0);
  // Normal should push out along +X.
  assert.ok(hit.nx > 0.9);
});

test('sphereVsBox: sphere centered inside box → still a hit', () => {
  const hit = sphereVsBox({ x: 0, y: 0, z: 0 }, 1, { cx: 0, cy: 0, cz: 0, hx: 5, hy: 5, hz: 5 });
  assert.ok(hit);
});

test('sphereVsCone: sphere above cone tip (high alt) → no hit', () => {
  // Cone base at origin, height 100 → tip at y=100. Sphere at y=200, far above.
  const hit = sphereVsCone({ x: 0, y: 200, z: 0 }, 5, { cx: 0, cy: 0, cz: 0, height: 100, radius: 50 });
  assert.equal(hit, null);
});

test('sphereVsCone: sphere far horizontally → no hit', () => {
  const hit = sphereVsCone({ x: 500, y: 50, z: 0 }, 5, { cx: 0, cy: 0, cz: 0, height: 100, radius: 50 });
  assert.equal(hit, null);
});

test('sphereVsCone: sphere inside the cone profile → hit', () => {
  // At y=50 (mid-height), local radius = 50 * (1 - 50/100) = 25. Sphere at x=10 is well inside.
  const hit = sphereVsCone({ x: 10, y: 50, z: 0 }, 5, { cx: 0, cy: 0, cz: 0, height: 100, radius: 50 });
  assert.ok(hit, 'expected a hit');
  assert.ok(hit.depth >= 0);
});

test('classifyHit: front impact maps to fuselage', () => {
  // hit ahead of the aircraft (in body -Z direction) and roughly centered
  const which = classifyHit({ localX: 0, localY: 0, localZ: -3 });
  assert.equal(which, 'fuselage');
});

test('classifyHit: side impact at +X with significant offset → rightWing', () => {
  const which = classifyHit({ localX: 4, localY: 0, localZ: 0 });
  assert.equal(which, 'rightWing');
});

test('classifyHit: side impact at -X → leftWing', () => {
  const which = classifyHit({ localX: -4, localY: 0, localZ: 0 });
  assert.equal(which, 'leftWing');
});

test('classifyHit: rear impact maps to tail', () => {
  const which = classifyHit({ localX: 0, localY: 0, localZ: 3 });
  assert.equal(which, 'tail');
});

test('classifyHit: nose-front close to centerline → engine', () => {
  // Within the front cone but right at the very nose
  const which = classifyHit({ localX: 0, localY: 0, localZ: -4.4 });
  assert.equal(which, 'engine');
});
