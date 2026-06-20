// Autopilot TECS-lite longitudinal tests (M14). The pitch loop holds the energy
// BALANCE: climb when below target altitude, but trade altitude for airspeed when
// slow — so the autopilot can't command a stalling climb.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as ap from '../src/autopilot.js';

const HOME = { lat: 37.4602, lon: 126.4407, alt: 7 };
// A waypoint straight ahead (due north = −z) and well above, so the autopilot is
// in NAV with a climb demand and ~zero heading error.
const WP_AHEAD_ABOVE = { lat: HOME.lat + 0.02, lon: HOME.lon, alt: 300, frame: 3 };

// Airborne state heading north at a given speed, wings level, on target heading.
function navState(speed) {
  return {
    x: 0, y: 100, z: 0,            // altAGL ≈ 99 > TAKEOFF_ALT_M → NAV phase
    vx: 0, vy: 0, vz: -speed,      // moving north
    headingRad: 0, bankRad: 0, pitchRad: 0, pitchRate: 0, rollRate: 0,
  };
}

function startNav() {
  ap.setMission([WP_AHEAD_ABOVE], HOME);
  ap.startMission();
}

test('TECS-lite: climbs (pitch up) when below target altitude at cruise speed', () => {
  startNav();
  const out = ap.tick(navState(50));
  assert.equal(ap.getPhase(), 'NAV');
  assert.ok(out.pitch > 0, `expected climb pitch, got ${out.pitch}`);
});

test('TECS-lite: lowers the nose when slow even though below target altitude', () => {
  startNav();
  const fast = ap.tick(navState(50)).pitch;
  startNav();
  const slow = ap.tick(navState(28)).pitch; // well below cruise → trade alt for speed
  assert.ok(slow < fast, `slow pitch ${slow} should be below fast pitch ${fast} (stall protection)`);
});

test('TECS-lite: throttle increases when slow (total-energy demand)', () => {
  // Level waypoint (same altitude) so only the speed term drives the throttle.
  const WP_LEVEL = { lat: HOME.lat + 0.02, lon: HOME.lon, alt: 100, frame: 3 };
  ap.setMission([WP_LEVEL], HOME); ap.startMission();
  const fast = ap.tick(navState(55)).throttle;
  ap.setMission([WP_LEVEL], HOME); ap.startMission();
  const slow = ap.tick(navState(30)).throttle;
  assert.ok(slow > fast, `slow throttle ${slow} should exceed fast throttle ${fast}`);
});

test('autopilot: tick returns null when no mission is active', () => {
  ap.abort();
  assert.equal(ap.tick(navState(50)), null);
});

// ---------- coordinated turn direction (M17) ----------

// Waypoint off to one side, plane in NAV heading north at cruise.
function navTowardWaypoint(wp) {
  ap.setMission([wp], HOME); ap.startMission();
  return ap.tick(navState(50));
}

test('turn direction: a left vs right waypoint commands opposite roll (turns the right way)', () => {
  const east = { lat: HOME.lat + 0.01, lon: HOME.lon + 0.01, alt: 100, frame: 3 }; // ahead + right
  const west = { lat: HOME.lat + 0.01, lon: HOME.lon - 0.01, alt: 100, frame: 3 }; // ahead + left
  const rollEast = navTowardWaypoint(east).roll;
  const rollWest = navTowardWaypoint(west).roll;
  assert.ok(rollEast !== 0 && rollWest !== 0, 'should command a turn');
  assert.ok(Math.sign(rollEast) === -Math.sign(rollWest),
    `left/right targets must bank opposite ways (east=${rollEast}, west=${rollWest})`);
});

test('turn coordinator: commands rudder in a bank (β-free coordinated turn)', () => {
  ap.setMission([{ lat: HOME.lat + 0.01, lon: HOME.lon + 0.01, alt: 100, frame: 3 }], HOME);
  ap.startMission();
  const out = ap.tick({ ...navState(50), bankRad: 0.3 }); // established right bank
  assert.ok(Math.abs(out.yaw) > 1e-3, `bank should produce coordinating rudder, got ${out.yaw}`);
});
