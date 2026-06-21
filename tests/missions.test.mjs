// Demo mission tests (M12). A built-in circuit lets AUTO mode be flown (and
// regression-tested) without a QGC mission upload. waypointToLocal in autopilot
// maps lat/lon→local meters; buildDemoMission is its inverse for a few points.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { localToWaypoint, buildDemoMission } from '../src/missions.js';

const HOME = { lat: 37.4602, lon: 126.4407, alt: 7 };
const closeTo = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Mirror of autopilot.waypointToLocal so we can round-trip.
function waypointToLocal(wp, home) {
  const cosLat = Math.cos(home.lat * Math.PI / 180);
  const yMeters = (wp.frame === 0) ? (wp.alt - home.alt) : wp.alt;
  return {
    x: (wp.lon - home.lon) * 111320 * cosLat,
    y: yMeters,
    z: -(wp.lat - home.lat) * 111320,
  };
}

test('localToWaypoint: round-trips through waypointToLocal', () => {
  const wp = localToWaypoint(HOME, 900, -600, 200);
  const local = waypointToLocal(wp, HOME);
  assert.ok(closeTo(local.x, 900, 1e-3), `x ${local.x}`);
  assert.ok(closeTo(local.z, -600, 1e-3), `z ${local.z}`);
  assert.ok(closeTo(local.y, 200, 1e-6), `y ${local.y}`);
});

test('localToWaypoint: uses relative-altitude frame (3) with AGL alt', () => {
  const wp = localToWaypoint(HOME, 0, 0, 150);
  assert.equal(wp.frame, 3);
  assert.equal(wp.alt, 150);
});

test('localToWaypoint: produces finite lat/lon near home', () => {
  const wp = localToWaypoint(HOME, 1000, 1000, 100);
  assert.ok(Number.isFinite(wp.lat) && Number.isFinite(wp.lon));
  assert.ok(Math.abs(wp.lat - HOME.lat) < 0.05 && Math.abs(wp.lon - HOME.lon) < 0.05);
});

test('buildDemoMission: returns a multi-waypoint climbing circuit', () => {
  const m = buildDemoMission(HOME);
  assert.equal(m.home, HOME);
  assert.ok(m.items.length >= 3, `expected ≥3 waypoints, got ${m.items.length}`);
  for (const wp of m.items) {
    assert.ok(Number.isFinite(wp.lat) && Number.isFinite(wp.lon));
    assert.equal(wp.frame, 3);
    if (!wp.land) assert.ok(wp.alt > 0, 'cruise legs climb');
  }
});

test('buildDemoMission: ends with a touchdown (land) waypoint at ground level', () => {
  const m = buildDemoMission(HOME);
  const last = m.items[m.items.length - 1];
  assert.equal(last.land, true);
  assert.equal(last.alt, 0);
  // exactly one landing waypoint
  assert.equal(m.items.filter((w) => w.land).length, 1);
});

test('buildDemoMission: first waypoint is ahead of the runway start (toward -z)', () => {
  const m = buildDemoMission(HOME);
  const first = waypointToLocal(m.items[0], HOME);
  // Plane starts at z≈950 heading -z, so the first WP must be at smaller z.
  assert.ok(first.z < 950, `first WP z=${first.z} should be ahead of start`);
});
