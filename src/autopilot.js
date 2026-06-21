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

const ARRIVAL_HORIZ_M = 160;       // switch waypoints early (anticipate the turn)
                                   // — avoids a tight over-steer at the exact WP,
                                   // robust to the lagging GPS estimate (M18)
const ARRIVAL_VERT_M  = 100;       // looser vertical so it advances regardless
// Phase transition thresholds.
const TAKEOFF_ALT_M   = 50;        // higher climb-out before turning
const ROTATE_SPEED    = 42;        // rotate only well above stall — the moment-
                                   // based 6-DOF (M8) needs real flying speed or
                                   // it mushes back onto the runway after liftoff
const TAKEOFF_PITCH   = 8 * Math.PI / 180;
const GROUND_OFFSET   = 0.8;       // matches aircraft.userData.gearOffset

// Outer-loop limits.
const MAX_BANK  = 25 * Math.PI / 180;   // 25° — coordinated, so sustainable; tight
                                        // enough to navigate the waypoint spacing
const MAX_PITCH = 8 * Math.PI / 180;    // 8° — a sustainable climb at full power
// Outer-loop gains.
const HEADING_TO_BANK = 1.1;            // responsive heading→bank (turn coordinator
                                        // keeps it coordinated, so this can be brisk)

// Longitudinal control (classic separation): pitch holds altitude, throttle holds
// airspeed. A hard speed guard forces the nose down below SAFE_SPEED so a climb or
// turn can never stall; turn compensation adds back-pressure for the bank.
const ALT_TO_PITCH    = 0.012;          // rad per metre of altitude error
const SAFE_SPEED      = 42;             // m/s — below this, pitch is forced down
const SPEED_PROT_GAIN = 0.03;           // rad per m/s below SAFE_SPEED
const TURN_COMP       = 0.55;           // back-pressure ∝ (1/cos(bank) − 1)
const VS_DAMP         = 0.06;           // climb-rate damping → less altitude overshoot
const VS_SCALE        = 8;              // m/s normalizing the climb rate
const THR_TRIM        = 0.5;
const THR_SPEED_GAIN  = 0.045;          // strong airspeed hold (ramp power when slow)
const THR_CLIMB_FF    = 0.0008;         // small climb feedforward (per metre below)
const THR_FLOOR       = 0.15;           // allows cruise/descent without overspeeding
// Inner-loop gains. Gentle P with strong rate damping: the moment-based 6-DOF
// (M8) responds fast, so an aggressive P overshoots into a PIO — and sensor
// noise (sensor-in-the-loop) excites it. More D, less P keeps it critically-ish
// damped on both truth and noisy estimated nav.
// Roll uses a rate-limited inner loop: bank error → a CAPPED desired roll rate →
// aileron. The plane rolls in at a controlled rate and stops at the target bank
// without overshooting into an unsustainable high-bank, speed-bleeding turn.
const BANK_TO_RATE  = 1.2;   // (rad/s) desired roll rate per rad of bank error
const MAX_ROLL_RATE = 0.25;  // rad/s — gentle roll-in (~14°/s)
const ROLL_RATE_KP  = 2.5;   // aileron per (rad/s) roll-rate error
const PITCH_KP = 1.0;
const PITCH_RATE_KD = 1.0;
const rollToBank = (targetBank, bankRad, rollRate) => {
  const desiredRollRate = clamp((targetBank - bankRad) * BANK_TO_RATE, -MAX_ROLL_RATE, MAX_ROLL_RATE);
  return clamp((desiredRollRate - rollRate) * ROLL_RATE_KP, -ROLL_LIMIT, ROLL_LIMIT);
};

// Limited surface authority: at cruise the elevator is very effective, so a
// large command snaps the nose past stall before the rate term can catch it.
const ROLL_LIMIT = 0.35;
const PITCH_LIMIT_UP = 0.22;
const PITCH_LIMIT_DOWN = -0.22;

// Turn coordinator (M17): command the rudder to track the COORDINATED yaw rate of
// the current bank, r_coord = g·tan(φ)/V. Driving the actual turn rate zeros the
// sideslip — so the dihedral can't roll the bank up into a spiral, the bank holds
// at the (small) command, load stays low, airspeed is kept, and the turn never
// stalls. The airframe's own Cn_r damps the dutch-roll oscillation.
const G          = 9.81;
const YAW_RATE_KP = 2.0; // rudder per (rad/s) coordinated-yaw-rate error
const ARI         = 0.2; // aileron→rudder feedforward (anticipate adverse yaw on roll-in)
const YAW_LIMIT   = 0.7;
const yawCommand = (rollCmd, bankRad, yawRate, speed) => {
  const rCoord = G * Math.tan(clamp(bankRad, -1.2, 1.2)) / Math.max(speed, 20);
  return clamp(YAW_RATE_KP * (rCoord - (yawRate || 0)) + ARI * rollCmd, -YAW_LIMIT, YAW_LIMIT);
};

const TARGET_SPEED = 50;     // m/s cruise
const REF_SPEED    = 44;     // m/s — gain-scheduling reference (gains tuned here)

// ----- Landing (M20): glideslope approach → flare → touchdown -----
const GLIDESLOPE     = 4 * Math.PI / 180;  // ~4° descent path to the touchdown point
const APPROACH_ALT   = 160;                // m — cap the glideslope target (start of descent)
const APPROACH_SPEED = 46;                  // m/s — approach airspeed (above stall)
const FLARE_PITCH    = 1.2 * Math.PI / 180;  // small nose-up — just softens the firm touchdown
const FLARE_ALT      = 7;                    // m AGL — begin the (short) flare
let hasClimbedOut = false;                  // true once airborne — stops re-entering TAKEOFF
let landingCommitted = false;               // true once low on final — no climb-back / float

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
  hasClimbedOut = false;
  landingCommitted = false;
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
export function tick(simState, dt = 0.02) {
  if (!isActive()) { phase = 'IDLE'; return null; }
  if (currentSeq >= mission.items.length) { phase = 'DONE'; return holdLevel(); }

  const altAGL = simState.y - GROUND_OFFSET;
  const speed = Math.hypot(simState.vx, simState.vy, simState.vz);

  // Gain scheduling: control-surface authority grows with dynamic pressure (∝v²).
  // Scale the inner-loop commands by (REF/v)² so the effective loop gain — and
  // thus the pitch/roll response — stays roughly constant from rotation to cruise,
  // instead of overshooting into a PIO at high speed.
  const qScale = clamp((REF_SPEED / Math.max(speed, 20)) ** 2, 0.35, 1.2);

  if (altAGL >= TAKEOFF_ALT_M) hasClimbedOut = true;

  // ----- LANDING phase ---------------------------------------------------
  // Once the current waypoint is a touchdown point, fly the glideslope down to
  // it, flare, and touch down — instead of treating the low altitude as takeoff.
  if (mission.items[currentSeq] && mission.items[currentSeq].land && hasClimbedOut) {
    return landControl(simState, mission.items[currentSeq], speed, altAGL, qScale);
  }

  // ----- TAKEOFF phase ---------------------------------------------------
  // Banking on the runway makes the plane skid sideways without ever
  // climbing out. Hold wings level, throttle up, rotate gently once we're
  // past rotate-speed. Switch to NAV when safely airborne. Only at the start —
  // hasClimbedOut stops this from firing again as we descend to land.
  if (altAGL < TAKEOFF_ALT_M && !hasClimbedOut) {
    phase = 'TAKEOFF';
    const rollCmd = rollToBank(0, simState.bankRad, simState.rollRate);
    let pitchCmd = 0;
    if (speed > ROTATE_SPEED) {
      pitchCmd = clamp(
        (TAKEOFF_PITCH - simState.pitchRad) * PITCH_KP - simState.pitchRate * PITCH_RATE_KD,
        PITCH_LIMIT_DOWN, PITCH_LIMIT_UP,
      );
    }
    return {
      pitch: pitchCmd * qScale, roll: rollCmd * qScale,
      yaw: yawCommand(rollCmd * qScale, simState.bankRad, simState.yawRate, speed), throttle: 1.0,
    };
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

  // ----- Outer loop: heading + altitude pitch with hard speed protection --
  const desiredHeading = Math.atan2(dx, -dz);
  const headingErr = wrapPi(desiredHeading - simState.headingRad);
  // Turn speed guard: scale bank down as airspeed drops toward SAFE_SPEED, so a
  // turn is never commanded that would bleed speed into a stall (roll wings level
  // to recover when slow). Restores full bank authority at cruise.
  const turnMargin = clamp((speed - SAFE_SPEED) / (TARGET_SPEED - SAFE_SPEED), 0, 1);
  // NOTE: empirically the bank/heading sign in this sim requires a negative
  // mapping here — a +heading-error (target to the right) needs a left-signed
  // bank command to actually turn toward it. (Verified by position tracking.)
  const desiredBank = clamp(-headingErr * HEADING_TO_BANK, -MAX_BANK, MAX_BANK) * turnMargin;

  // Pitch holds altitude; throttle (below) holds speed. The hard speed guard
  // forces the nose down below SAFE_SPEED so a turn/climb can never stall.
  const turnComp = TURN_COMP * (1 / Math.cos(desiredBank) - 1);
  const vsDamp = VS_DAMP * clamp(simState.vy / VS_SCALE, -1, 1); // anticipate level-off
  let desiredPitch = clamp(dy * ALT_TO_PITCH + turnComp - vsDamp, -MAX_PITCH, MAX_PITCH);
  if (speed < SAFE_SPEED) {
    desiredPitch = Math.min(desiredPitch, (speed - SAFE_SPEED) * SPEED_PROT_GAIN);
  }

  // ----- Inner loop: rate-limited roll + pitch PD ------------------------
  const pitchErr = desiredPitch - simState.pitchRad;
  const rollCmd  = rollToBank(desiredBank, simState.bankRad, simState.rollRate);
  const pitchCmd = clamp(
    pitchErr * PITCH_KP - simState.pitchRate * PITCH_RATE_KD,
    PITCH_LIMIT_DOWN, PITCH_LIMIT_UP,
  );

  // ----- Throttle: hold airspeed (strong) + climb feedforward ------------
  // A strong speed term ramps power up the moment a turn or climb bleeds speed,
  // so airspeed is held at target and the pitch loop never has to stall to climb.
  const throttleCmd = clamp(
    THR_TRIM + (TARGET_SPEED - speed) * THR_SPEED_GAIN + Math.max(0, dy) * THR_CLIMB_FF,
    THR_FLOOR, 1.0,
  );

  return {
    pitch: pitchCmd * qScale, roll: rollCmd * qScale,
    yaw: yawCommand(rollCmd * qScale, simState.bankRad, simState.yawRate, speed), throttle: throttleCmd,
  };
}

function holdLevel() {
  return { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 };
}

// Glideslope approach → flare → touchdown to a `land` waypoint (the touchdown
// point, alt 0). Lateral: track the centreline. Vertical: hold a ~4° glidepath
// (pitch tracks the slope, throttle holds approach speed); flare and cut power
// near the ground so the descent rate is gentle at touchdown.
function landControl(simState, landWp, speed, altAGL, qScale) {
  const tgt = waypointToLocal(landWp, mission.home);
  const dx = tgt.x - simState.x;
  const dz = tgt.z - simState.z;
  const distToTD = Math.hypot(dx, dz);

  // Lateral: steer the centreline toward the touchdown point.
  const desiredHeading = Math.atan2(dx, -dz);
  const headingErr = wrapPi(desiredHeading - simState.headingRad);
  const turnMargin = clamp((speed - SAFE_SPEED) / (TARGET_SPEED - SAFE_SPEED), 0, 1);
  const desiredBank = clamp(-headingErr * HEADING_TO_BANK, -MAX_BANK, MAX_BANK) * turnMargin;
  const rollCmd = rollToBank(desiredBank, simState.bankRad, simState.rollRate);

  // Vertical: reuse the PROVEN-stable cruise longitudinal control (pitch holds the
  // target altitude with a hard speed guard, throttle holds airspeed) but feed it a
  // glideslope target altitude that descends to 0 at the touchdown point. Because
  // it's the same loop that holds cruise rock-solid, the descent never stalls.
  // Cap the glideslope target at the current altitude so the approach never
  // commands a CLIMB (which, with reduced power, would stall): it holds level
  // until the descending slope reaches it, then follows it down. Capture from above.
  const glideAGL = Math.min(distToTD * Math.tan(GLIDESLOPE), APPROACH_ALT, altAGL);
  const dy = (glideAGL + GROUND_OFFSET) - simState.y;    // target − current altitude

  // ----- ROLLOUT: on the ground, idle and let rolling friction stop it -----
  if (altAGL < 1.5) {
    if (speed < 30) { phase = 'DONE'; currentSeq = mission.items.length; }
    else phase = 'FLARE';
    return { pitch: 0, roll: rollCmd * qScale, yaw: 0, throttle: 0 };
  }

  if (altAGL < FLARE_ALT) landingCommitted = true; // committed to land — no climb-back

  let desiredPitch, throttleCmd;
  if (landingCommitted && altAGL >= FLARE_ALT) {
    phase = 'FLARE';
    // Ballooned after committing → sink gently back down (never climb away again).
    desiredPitch = -0.05;
    throttleCmd = 0;
  } else if (altAGL < FLARE_ALT) {
    phase = 'FLARE';
    // Ease the nose up to soften the touchdown; trickle power so it doesn't stall
    // (a firm touchdown at speed is safe — the ground rolls it out).
    desiredPitch = FLARE_PITCH * clamp((FLARE_ALT - altAGL) / FLARE_ALT, 0, 1);
    throttleCmd = 0;
  } else {
    phase = 'APPROACH';
    desiredPitch = clamp(dy * ALT_TO_PITCH - VS_DAMP * clamp(simState.vy / VS_SCALE, -1, 1), -MAX_PITCH, MAX_PITCH);
    if (speed < SAFE_SPEED) desiredPitch = Math.min(desiredPitch, (speed - SAFE_SPEED) * SPEED_PROT_GAIN);
    throttleCmd = clamp(THR_TRIM + (APPROACH_SPEED - speed) * THR_SPEED_GAIN + Math.max(0, dy) * THR_CLIMB_FF, 0.1, 0.85);
  }
  const pitchCmd = clamp(
    (desiredPitch - simState.pitchRad) * PITCH_KP - simState.pitchRate * PITCH_RATE_KD,
    PITCH_LIMIT_DOWN, PITCH_LIMIT_UP,
  );

  return {
    pitch: pitchCmd * qScale, roll: rollCmd * qScale,
    yaw: yawCommand(rollCmd * qScale, simState.bankRad, simState.yawRate, speed),
    throttle: throttleCmd,
  };
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
