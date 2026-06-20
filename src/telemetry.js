// Telemetry: POST sim state to the bridge for MAVLink relay to QGroundControl.
// Fail-silent: if the bridge is offline, the sim still runs unaffected.
//
// Endpoint resolution:
//   1. If the page was served from the bridge itself (same origin), use a
//      relative `/telemetry` — works regardless of host/port.
//   2. Otherwise (file://, python http.server, different port), target the
//      bridge directly at http://localhost:<BRIDGE_PORT>/telemetry. The
//      bridge sets permissive CORS so cross-origin POST is fine.
//   3. Override at runtime by setting `window.TELEMETRY_URL` before the
//      module loads (e.g. for a remote bridge on another machine).

const BRIDGE_PORT_DEFAULT = 8765;
const DEG2RAD = Math.PI / 180;

/**
 * Merge measured (sensor) values into a truth telemetry payload so the GCS sees
 * what the avionics see — making sensor faults (GPS jam/bias/freeze, baro/air-
 * data errors) visible in QGroundControl. Pure: inputs are not mutated.
 *
 * The bridge maps t.x→lon, t.z→lat, t.altitude→alt, so the GPS sensor channels
 * (gpsX/gpsZ) and baro (altitude) drive the position the GCS plots.
 *
 * @param {object} truth     the true-state payload
 * @param {object|null} measured  sensor readings (gpsX/gpsZ/altitude/airspeed/
 *                            roll/pitch/heading in m, m/s, deg). Falsy/empty → truth.
 * @returns {object} payload with sensor-backed fields substituted
 */
export function mergeMeasuredIntoTelemetry(truth, measured) {
  if (!measured || measured.gpsX === undefined) return { ...truth };
  return {
    ...truth,
    x: measured.gpsX,
    z: measured.gpsZ,
    altitude: measured.altitude,
    speed: measured.airspeed,
    rollRad: measured.roll * DEG2RAD,
    pitchRad: measured.pitch * DEG2RAD,
    headingDeg: measured.heading,
  };
}

function resolveEndpoint() {
  if (typeof window !== 'undefined' && window.TELEMETRY_URL) {
    return window.TELEMETRY_URL;
  }
  if (typeof location !== 'undefined') {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      // Same-origin if we appear to be the bridge; otherwise absolute to bridge.
      if (location.port === String(BRIDGE_PORT_DEFAULT)) return '/telemetry';
      return `${location.protocol}//${location.hostname || 'localhost'}:${BRIDGE_PORT_DEFAULT}/telemetry`;
    }
  }
  // file:// or unknown — assume bridge on localhost:8765.
  return `http://localhost:${BRIDGE_PORT_DEFAULT}/telemetry`;
}

const ENDPOINT = resolveEndpoint();
const PERIOD_MS = 50;          // 20 Hz
const BACKOFF_MS = 3000;       // when bridge looks dead

let last = 0;
let inFlight = false;
let consecutiveFails = 0;
let online = false;

export function isBridgeOnline() {
  return online;
}

export function maybeSend(state, now) {
  // Stop trying so often when the bridge looks offline.
  const period = consecutiveFails > 5 ? BACKOFF_MS : PERIOD_MS;
  if (now - last < period) return;
  if (inFlight) return;

  last = now;
  inFlight = true;

  // Don't await — fire-and-forget so the render loop never blocks.
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(state),
    keepalive: true,
  }).then(res => {
    if (res.ok) {
      consecutiveFails = 0;
      online = true;
    } else {
      consecutiveFails++;
      online = false;
    }
  }).catch(() => {
    consecutiveFails++;
    online = false;
  }).finally(() => {
    inFlight = false;
  });
}
