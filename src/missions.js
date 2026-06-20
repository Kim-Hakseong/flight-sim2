// Built-in demo mission (M12). Lets AUTO mode be flown — and headlessly
// regression-tested — without uploading a mission from QGroundControl.
// COORDINATE: local sim frame: +x east, +z south (north = -z), y = AGL meters.
//
// localToWaypoint is the inverse of autopilot.waypointToLocal:
//   x = (lon-home.lon)·111320·cos(lat),  z = -(lat-home.lat)·111320

const M_PER_DEG = 111320;

/**
 * Convert a local-frame point (east x, sim-z, AGL alt) to a MAVLink-style
 * waypoint {lat, lon, alt, frame}. frame 3 = relative altitude (AGL). Pure.
 */
export function localToWaypoint(home, xEast, zLocal, altAGL) {
  const cosLat = Math.cos(home.lat * Math.PI / 180);
  return {
    lat: home.lat + (-zLocal) / M_PER_DEG,
    lon: home.lon + xEast / (M_PER_DEG * cosLat),
    alt: altAGL,
    frame: 3,
  };
}

// Circuit in local meters: climb out straight ahead, right turn, downwind,
// base turn back toward the field. Plane starts at z≈950 heading -z.
// A rectangular circuit flown clockwise with four ~90° right turns (plane starts
// z≈950 heading −z = north). Legs (~1500 m) are well clear of the ~640 m turn
// radius, so the coordinated-turn autopilot (M17) navigates it on truth AND on
// the sensor-fused 'estimated' nav (M18).
const LEGS = [
  { x: 0,    z: -2200, alt: 150 }, // 1: climb straight north to cruise
  { x: 1500, z: -2200, alt: 150 }, // 2: turn right → east
  { x: 1500, z: -700,  alt: 150 }, // 3: turn right → south
  { x: 0,    z: -700,  alt: 150 }, // 4: turn right → west, back toward start
];

/** Build the demo circuit mission for a given home. Pure. */
export function buildDemoMission(home) {
  return {
    home,
    items: LEGS.map((l) => localToWaypoint(home, l.x, l.z, l.alt)),
  };
}
