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
// Straight, climbing-then-level legs ahead of the runway (plane starts z≈950
// heading −z). The separation-control autopilot (M14/M15) flies these rock-solid:
// it climbs to cruise and holds altitude/airspeed precisely. Coordinated turns
// still wallow (lateral-directional dynamics need offline pole-placement) → M16.
const LEGS = [
  { x: 0,    z: -1400, alt: 150 }, // 1: straight climb — stabilize at cruise
  { x: 900,  z: -2300, alt: 150 }, // 2: level right turn (crosswind)
  { x: 900,  z: -900,  alt: 150 }, // 3: level downwind
  { x: 0,    z: -1600, alt: 150 }, // 4: level base turn back
];

/** Build the demo circuit mission for a given home. Pure. */
export function buildDemoMission(home) {
  return {
    home,
    items: LEGS.map((l) => localToWaypoint(home, l.x, l.z, l.alt)),
  };
}
