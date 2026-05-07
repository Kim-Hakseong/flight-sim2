// Autopilot: cascade (outer/inner) P+D controller for AUTO mission flight.
// COORDINATE: Three.js right-handed, +Y up, -Z forward. Sim +X = east, -Z = north.
//
// Why two loops:
//   A naive P from heading error directly to roll rate goes unstable: the
//   controller saturates roll, the plane banks past 90°, goes inverted, and
//   the system effectively barrel-rolls without ever turning. The cascade
//   form below limits bank angle (outer loop) before commanding roll rate
//   (inner loop), so the plane settles into a coordinated turn.
//
// Loops:
//   heading_err  → desired_bank   (clamped to ±MAX_BANK)
//   bank_err     → roll_cmd       (P on bank, D on roll rate)
//   altitude_err → desired_pitch  (clamped to ±MAX_PITCH)
//   pitch_err    → pitch_cmd      (P on pitch, D on pitch rate)

let mission = null;        // { items: [...], home: {lat, lon, alt} }
let started = false;
let currentSeq = 0;
let phase = 'IDLE';         // IDLE | TAKEOFF | NAV | DONE

const ARRIVAL_HORIZ_M = 80;        // tighter so plane really hits the waypoint
const ARRIVAL_VERT_M  = 80;        // looser vertical so it advances even if we
                                   // can't reach the exact altitude
// Phase transition thresholds.
const TAKEOFF_ALT_M   = 50;        // higher climb-out before turning
const ROTATE_SPEED    = 25;
const TAKEOFF_PITCH   = 8 * Math.PI / 180;
const GROUND_OFFSET   = 0.8;       // matches aircraft.userData.gearOffset

// Outer-loop limits.
const MAX_BANK  = 40 * Math.PI / 180;   // 40° — tighter turns
const MAX_PITCH = 18 * Math.PI / 180;   // 18° pitch envelope
// Outer-loop gains.
const HEADING_TO_BANK = 1.4;            // more aggressive heading→bank
const ALT_TO_PITCH    = 0.018;          // crisper altitude tracking
// Inner-loop gains.
const BANK_KP = 2.0;
const ROLL_RATE_KD = 0.45;
const PITCH_KP = 2.6;
const PITCH_RATE_KD = 0.30;

const ROLL_LIMIT = 0.8;
const PITCH_LIMIT_UP = 0.6;
const PITCH_LIMIT_DOWN = -0.4;

const TARGET_SPEED = 50;     // m/s cruise

export function setMission(items, home) {
  mission = { items: items || [], home };
  currentSeq = 0;
  started = false;
  phase = 'IDLE';
}
export function startMission() {
  if (!mission || mission.items.length === 0) return;
  started = true;
  currentSeq = 0;
  phase = 'TAKEOFF';
}
export function abort() { started = false; phase = 'IDLE'; }
export function isActive() { return !!(mission && started); }
export function getCurrentSeq() { return currentSeq; }
export function getMissionLength() { return mission ? mission.items.length : 0; }
export function hasMission() { return !!(mission && mission.items.length > 0); }
export function getPhase() { return phase; }

/**
 * simState fields:
 *   x, y, z         — sim position
 *   vx, vy, vz      — sim velocity
 *   headingRad      — heading from north, atan2(fwd.x, -fwd.z)
 *   bankRad         — + when right wing down
 *   pitchRad        — + when nose up
 *   rollRate        — body roll rate, + when rolling right wing down (rad/s)
 *   pitchRate       — body pitch rate, + when nose pitching up (rad/s)
 */
export function tick(simState) {
  if (!isActive()) { phase = 'IDLE'; return null; }
  if (currentSeq >= mission.items.length) { phase = 'DONE'; return holdLevel(); }

  const altAGL = simState.y - GROUND_OFFSET;
  const speed = Math.hypot(simState.vx, simState.vy, simState.vz);

  // ----- TAKEOFF phase ---------------------------------------------------
  // Banking on the runway makes the plane skid sideways without ever
  // climbing out. Hold wings level, throttle up, rotate gently once we're
  // past rotate-speed. Switch to NAV when safely airborne.
  if (altAGL < TAKEOFF_ALT_M) {
    phase = 'TAKEOFF';
    const rollCmd = clamp(
      (0 - simState.bankRad) * BANK_KP - simState.rollRate * ROLL_RATE_KD,
      -ROLL_LIMIT, ROLL_LIMIT,
    );
    let pitchCmd = 0;
    if (speed > ROTATE_SPEED) {
      pitchCmd = clamp(
        (TAKEOFF_PITCH - simState.pitchRad) * PITCH_KP - simState.pitchRate * PITCH_RATE_KD,
        PITCH_LIMIT_DOWN, PITCH_LIMIT_UP,
      );
    }
    return { pitch: pitchCmd, roll: rollCmd, yaw: 0, throttle: 1.0 };
  }

  phase = 'NAV';

  // Arrival check.
  const wp = mission.items[currentSeq];
  const tgt = waypointToLocal(wp, mission.home);
  const horiz = Math.hypot(tgt.x - simState.x, tgt.z - simState.z);
  if (horiz < ARRIVAL_HORIZ_M && Math.abs(tgt.y - simState.y) < ARRIVAL_VERT_M) {
    currentSeq++;
    if (currentSeq >= mission.items.length) { phase = 'DONE'; return holdLevel(); }
  }

  // Re-resolve current target after possible advance.
  const wp2 = mission.items[Math.min(currentSeq, mission.items.length - 1)];
  const tgt2 = waypointToLocal(wp2, mission.home);
  const dx = tgt2.x - simState.x;
  const dz = tgt2.z - simState.z;
  const dy = tgt2.y - simState.y;

  // ----- Outer loop: heading & altitude ----------------------------------
  const desiredHeading = Math.atan2(dx, -dz);
  let headingErr = wrapPi(desiredHeading - simState.headingRad);
  const desiredBank = clamp(headingErr * HEADING_TO_BANK, -MAX_BANK, MAX_BANK);
  const desiredPitch = clamp(dy * ALT_TO_PITCH, -MAX_PITCH, MAX_PITCH);

  // ----- Inner loop: roll & pitch (PD) -----------------------------------
  const bankErr  = desiredBank  - simState.bankRad;
  const pitchErr = desiredPitch - simState.pitchRad;

  const rollCmd  = clamp(
    bankErr * BANK_KP - simState.rollRate * ROLL_RATE_KD,
    -ROLL_LIMIT, ROLL_LIMIT,
  );
  const pitchCmd = clamp(
    pitchErr * PITCH_KP - simState.pitchRate * PITCH_RATE_KD,
    PITCH_LIMIT_DOWN, PITCH_LIMIT_UP,
  );

  // ----- Throttle: hold cruise speed -------------------------------------
  let throttleCmd;
  if (speed < TARGET_SPEED - 5)      throttleCmd = 1.0;
  else if (speed < TARGET_SPEED + 5) throttleCmd = 0.7;
  else                                throttleCmd = 0.45;

  return { pitch: pitchCmd, roll: rollCmd, yaw: 0, throttle: throttleCmd };
}

function holdLevel() {
  return { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 };
}

function waypointToLocal(wp, home) {
  const dLat = wp.lat - home.lat;
  const dLon = wp.lon - home.lon;
  const cosLat = Math.cos(home.lat * Math.PI / 180);
  const yMeters = (wp.frame === 0) ? (wp.alt - home.alt) : wp.alt;
  return {
    x: dLon * 111320 * cosLat,
    y: yMeters,
    z: -dLat * 111320,
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function wrapPi(a) {
  while (a > Math.PI)  a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
