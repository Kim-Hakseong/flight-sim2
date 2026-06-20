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
const ROTATE_SPEED    = 42;        // rotate only well above stall — the moment-
                                   // based 6-DOF (M8) needs real flying speed or
                                   // it mushes back onto the runway after liftoff
const TAKEOFF_PITCH   = 8 * Math.PI / 180;
const GROUND_OFFSET   = 0.8;       // matches aircraft.userData.gearOffset

// Outer-loop limits.
const MAX_BANK  = 18 * Math.PI / 180;   // 18° — gentle, well-damped turns
const MAX_PITCH = 8 * Math.PI / 180;    // 8° — a sustainable climb at full power
// Outer-loop gains.
const HEADING_TO_BANK = 0.6;            // gentle heading→bank (avoid bank overshoot)

// TECS-lite longitudinal: pitch holds the energy BALANCE (climb when low, but
// trade altitude for speed when slow → stall-proof); throttle holds TOTAL energy
// (add power when low OR slow). Turn compensation adds back-pressure for the bank.
const ALT_ERR_SCALE   = 40;             // m — normalizes altitude error
const PITCH_FROM_ALT  = MAX_PITCH;      // full climb pitch at ≥ALT_ERR_SCALE below
const PITCH_FROM_SPEED = 0.40;          // rad per normalized speed error (nose down when slow)
const TURN_COMP       = 0.55;           // back-pressure ∝ (1/cos(bank) − 1)
const THR_TRIM        = 0.55;
const THR_FROM_ALT    = 0.9;   // a climb gets near-full power regardless of speed
const THR_FROM_SPEED  = 1.6;
// Inner-loop gains. Gentle P with strong rate damping: the moment-based 6-DOF
// (M8) responds fast, so an aggressive P overshoots into a PIO — and sensor
// noise (sensor-in-the-loop) excites it. More D, less P keeps it critically-ish
// damped on both truth and noisy estimated nav.
const BANK_KP = 0.9;
const ROLL_RATE_KD = 1.5;   // strong roll damping → no bank PIO into a spiral
const PITCH_KP = 1.0;
const PITCH_RATE_KD = 1.0;

// Limited surface authority: at cruise the elevator is very effective, so a
// large command snaps the nose past stall before the rate term can catch it.
const ROLL_LIMIT = 0.35;
const PITCH_LIMIT_UP = 0.22;
const PITCH_LIMIT_DOWN = -0.22;

const TARGET_SPEED = 50;     // m/s cruise
const REF_SPEED    = 44;     // m/s — gain-scheduling reference (gains tuned here)

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

  // Gain scheduling: control-surface authority grows with dynamic pressure (∝v²).
  // Scale the inner-loop commands by (REF/v)² so the effective loop gain — and
  // thus the pitch/roll response — stays roughly constant from rotation to cruise,
  // instead of overshooting into a PIO at high speed.
  const qScale = clamp((REF_SPEED / Math.max(speed, 20)) ** 2, 0.35, 1.2);

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
    return { pitch: pitchCmd * qScale, roll: rollCmd * qScale, yaw: 0, throttle: 1.0 };
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

  // ----- Outer loop: heading + TECS-lite longitudinal --------------------
  const desiredHeading = Math.atan2(dx, -dz);
  const headingErr = wrapPi(desiredHeading - simState.headingRad);
  const desiredBank = clamp(headingErr * HEADING_TO_BANK, -MAX_BANK, MAX_BANK);

  const speedErr = (TARGET_SPEED - speed) / TARGET_SPEED;   // >0 = too slow
  const altErrN  = clamp(dy / ALT_ERR_SCALE, -1, 1);        // >0 = below target

  // Pitch = energy balance + turn compensation. When slow, the −speedErr term
  // lowers the nose to recover airspeed even if we're below target altitude.
  const turnComp = TURN_COMP * (1 / Math.cos(desiredBank) - 1);
  const desiredPitch = clamp(
    altErrN * PITCH_FROM_ALT - speedErr * PITCH_FROM_SPEED + turnComp,
    -MAX_PITCH, MAX_PITCH,
  );

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

  // ----- Throttle: total-energy demand -----------------------------------
  // Add power when low OR slow (total energy); the pitch loop above handles how
  // the energy is split between climb and acceleration.
  const throttleCmd = clamp(
    THR_TRIM + altErrN * THR_FROM_ALT + speedErr * THR_FROM_SPEED,
    0.2, 1.0,
  );

  return { pitch: pitchCmd * qScale, roll: rollCmd * qScale, yaw: 0, throttle: throttleCmd };
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
