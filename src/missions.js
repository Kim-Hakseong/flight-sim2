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
// A straight-in takeoff → climb → cruise → glideslope landing, all on runway
// heading (north, −z). No turns, so the landing demo (M20) is reliable; the
// coordinated-turn circuit is showcased separately (M17/M18). Sensor-fused
// 'estimated' nav (M18) flies it too.
const LEGS = [
  { x: 0, z: -1000, alt: 130 },            // 1: climb straight to cruise
  { x: 0, z: -2000, alt: 150 },            // 2: cruise, line up for the approach
  { x: 0, z: -4000, alt: 0, land: true },  // 3: straight-in glideslope → touchdown
];

/** Build the demo circuit+landing mission for a given home. Pure. */
export function buildDemoMission(home) {
  return {
    home,
    items: LEGS.map((l) => {
      const wp = localToWaypoint(home, l.x, l.z, l.alt);
      if (l.land) wp.land = true;
      return wp;
    }),
  };
}
