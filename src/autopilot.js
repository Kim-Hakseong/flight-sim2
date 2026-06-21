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
const GROUND_OFFSET   = 0.8;       // default gear height; overridden per-model via
                                   // simState.groundOffset (jets sit higher than the trainer)

// Outer-loop limits.
const MAX_BANK  = 25 * Math.PI / 180;   // 25° — coordinated, so sustainable; tight
                                        // enough to navigate the waypoint spacing
const APPROACH_BANK = 22 * Math.PI / 180;  // bank limit on the approach: enough to turn
                                        // onto the localiser at approach speed (15° is a
                                        // 765 m radius — too wide), capped below MAX_BANK.
                                        // Partial approach flap keeps the energy to sustain it.
const MAX_PITCH = 8 * Math.PI / 180;    // 8° — a sustainable climb at full power
// Outer-loop gains.
const HEADING_TO_BANK = 1.1;            // responsive heading→bank (turn coordinator
                                        // keeps it coordinated, so this can be brisk)
// Cross-track guidance (M22): in a crosswind, steering at the touchdown POINT
// gives almost no lateral authority while far out (the bearing barely changes),
// so the aircraft drifts downwind unbounded. Instead track the runway CENTRELINE
// — the line through the touchdown and the approach fix — with a saturating
// intercept angle. Constant authority regardless of range; a steady crosswind
// settles into a small standing crab (≈ drift/gain) instead of running away.
const XTE_TO_HEADING  = 0.006;          // rad of intercept per metre off centreline.
                                        // Balanced: stronger drifts downwind (gentle P
                                        // can't beat the crosswind), much stronger excites
                                        // a roll-overshoot limit cycle. This lands within
                                        // the cleared corridor across the wind envelope.
const XTE_RATE_DAMP   = 0.05;           // rad per (m/s) of closing rate — lead term that
                                        // rolls out early so the capture settles
const XTE_INT_GAIN    = 0;              // rad per (m·s) — integral OFF. With the M23 yaw damper
                                        // the lateral is stable and tracks to ~90 m; an integral
                                        // on top only added a slow overshoot (the residual is a
                                        // short-final/de-crab transient, not steady droop), so P+D.
const XTE_INT_CLAMP   = 0.35;           // rad — anti-windup cap on the integral term
const MAX_INTERCEPT   = 30 * Math.PI / 180;  // cap the intercept/crab angle

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
const YAW_FF_KP   = 1.6; // rudder per (rad/s) coordinated-turn feedforward (r_coord)
const YAW_DAMP_KP = 4.5; // rudder per (rad/s) yaw-RATE damping (oppose the rate error to
                         // r_coord). This is the real yaw damper — it adds the damping the
                         // divergent Dutch roll lacks at low approach speed. Scheduled by
                         // qScale so it's strong when slow (weak aero Cn_r·q̄) and backed off
                         // at cruise where it would otherwise rudder-PIO. (M23)
const ARI         = 0.2; // aileron→rudder feedforward (anticipate adverse yaw on roll-in)
const YAW_LIMIT   = 0.7;
const yawCommand = (rollCmd, bankRad, yawRate, speed, qScale = 1) => {
  const rCoord = G * Math.tan(clamp(bankRad, -1.2, 1.2)) / Math.max(speed, 20);
  const rateErr = rCoord - (yawRate || 0);
  return clamp(
    YAW_FF_KP * rCoord + YAW_DAMP_KP * qScale * rateErr + ARI * rollCmd,
    -YAW_LIMIT, YAW_LIMIT);
};

const TARGET_SPEED = 50;     // m/s cruise
const REF_SPEED    = 44;     // m/s — gain-scheduling reference (gains tuned here)

// ----- Landing (M20): glideslope approach → flare → touchdown -----
const GLIDESLOPE     = 4 * Math.PI / 180;  // ~4° descent path to the touchdown point
const APPROACH_ALT   = 160;                // m — cap the glideslope target (start of descent)
const APPROACH_SPEED = 42;                  // m/s — gust-resistant approach (~1.6× the
                                            // flapped stall): a slower 36 m/s approach
                                            // left too little margin, so a vertical gust
                                            // spiked AoA past the stall and the slick
                                            // wing departed. More speed = more margin.
const LANDING_SAFE   = 26;                  // m/s — flapped stall guard for the approach
const FLARE_PITCH    = 2.5 * Math.PI / 180;  // nose-up at the flare to soften the touchdown
const FLARE_ALT      = 7;                    // m AGL — begin the (short) flare
// Auto de-crab (M28): in a crosswind the approach flies a crab (nose into wind to
// track the centreline). Just before touchdown, kick the rudder to swing the nose
// onto the runway heading so the gear touches down aligned (no side-load). Active
// in the last few metres; on the ground it keeps the nose straight down the runway.
// Ground de-crab (M28): the approach flies a crab (nose into wind) to track the
// centreline. Airborne de-crab is impractical here — the flare is laterally marginal
// and any rudder in the air departs it — so the nose is straightened on the GROUND
// roll, where the wheels stabilise the lateral axis. Firm P on heading + rate damping.
const GROUND_DECRAB_GAIN = 2.6;             // rudder per rad of heading-vs-runway error
const GROUND_DECRAB_DAMP = 1.2;             // rudder per (rad/s) of yaw rate (damping)
const APPROACH_FLAP_ALT = 22;                // m AGL — below this, full landing flap;
                                             // above, only partial flap (low drag). Kept
                                             // low so the full-flap drag/lift change lands
                                             // close to the flare, not mid-approach.
let hasClimbedOut = false;                  // true once airborne — stops re-entering TAKEOFF
let landingCommitted = false;               // true once low on final — no climb-back / float
let xteIntegral = 0;                        // accumulated cross-track error (localiser integral)

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
  xteIntegral = 0;
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

  const groundOffset = simState.groundOffset || GROUND_OFFSET;
  const altAGL = simState.y - groundOffset;
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
    return landControl(simState, mission.items[currentSeq], speed, altAGL, qScale, dt);
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
      yaw: yawCommand(rollCmd * qScale, simState.bankRad, simState.yawRate, speed, qScale), throttle: 1.0,
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
    yaw: yawCommand(rollCmd * qScale, simState.bankRad, simState.yawRate, speed, qScale), throttle: throttleCmd,
  };
}

function holdLevel() {
  return { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 };
}

// Glideslope approach → flare → touchdown to a `land` waypoint (the touchdown
// point, alt 0). Lateral: track the centreline. Vertical: hold a ~4° glidepath
// (pitch tracks the slope, throttle holds approach speed); flare and cut power
// near the ground so the descent rate is gentle at touchdown.
function landControl(simState, landWp, speed, altAGL, qScale, dt = 0.02) {
  const tgt = waypointToLocal(landWp, mission.home);
  const dx = tgt.x - simState.x;
  const dz = tgt.z - simState.z;

  // Lateral: track the runway CENTRELINE (approach fix → touchdown), not the
  // touchdown point. Cross-track guidance gives full lateral authority even far
  // out, so a crosswind can't drift us off the localiser — it just produces a
  // standing crab. Fall back to point-steering if there is no approach fix.
  const fix = mission.items[currentSeq - 1];
  let desiredHeading;
  // Distance still to run to the touchdown. Use the ALONG-TRACK projection onto
  // the centreline (not 3D range): otherwise a lateral excursion inflates the
  // distance, the glideslope thinks we're far out and holds altitude, and the
  // aircraft circles at height instead of descending. Along-track descends it on
  // the proper slope regardless of how far off the centreline it currently is.
  let distToTD = Math.hypot(dx, dz);
  let courseHeading = simState.headingRad;   // runway heading (for de-crab); set below
  if (fix) {
    const a = waypointToLocal(fix, mission.home);   // centreline start (upwind)
    const cdx = tgt.x - a.x, cdz = tgt.z - a.z;      // centreline direction
    const len = Math.hypot(cdx, cdz) || 1;
    const ux = cdx / len, uz = cdz / len;            // along-course unit vector
    courseHeading = Math.atan2(ux, -uz);
    distToTD = Math.max(0, ux * dx + uz * dz);        // remaining along-track range
    // signed perpendicular offset from the centreline (course × position) and its
    // rate (course × velocity) — PD localiser tracking. The rate term provides
    // lead so the capture rolls out early instead of limit-cycling in gusts.
    const xte = ux * (simState.z - a.z) - uz * (simState.x - a.x);
    const xteDot = ux * simState.vz - uz * simState.vx;
    // Integrate the cross-track error (anti-windup clamped) to remove the standing
    // offset a steady crosswind leaves; freeze it once committed to the flare.
    if (!landingCommitted) {
      xteIntegral = clamp(xteIntegral + xte * dt * XTE_INT_GAIN, -XTE_INT_CLAMP, XTE_INT_CLAMP);
    }
    const intercept = clamp(
      xte * XTE_TO_HEADING + xteDot * XTE_RATE_DAMP + xteIntegral, -MAX_INTERCEPT, MAX_INTERCEPT);
    desiredHeading = courseHeading - intercept;      // steer back toward the line
  } else {
    desiredHeading = Math.atan2(dx, -dz);
  }
  const headingErr = wrapPi(desiredHeading - simState.headingRad);
  // Turn-stall guard scaled to the FLAPPED stall (LANDING_SAFE), not the clean
  // SAFE_SPEED: the flapped approach flies ~36 m/s, so a SAFE_SPEED(=42) guard
  // would zero the bank command and leave the approach with no lateral authority
  // to hold the centreline in a crosswind. Full authority at approach speed,
  // tapering only as it slows toward the flapped stall.
  const turnMargin = clamp((speed - LANDING_SAFE) / (APPROACH_SPEED - LANDING_SAFE), 0, 1);
  const desiredBank = clamp(-headingErr * HEADING_TO_BANK, -APPROACH_BANK, APPROACH_BANK) * turnMargin;
  const rollCmd = rollToBank(desiredBank, simState.bankRad, simState.rollRate);

  // De-crab: in the last few metres, a gentle rudder bias swings the nose onto the
  // runway heading so the gear touches down aligned. It is ADDED to the coordinated
  // yaw command (which keeps the yaw-rate damper active) — a full rudder kick at low
  // speed departs. Wings are levelled (roll → 0) as the nose comes straight.
  const levelRoll = rollToBank(0, simState.bankRad, simState.rollRate);
  const dampedYaw = (roll) => yawCommand(roll * qScale, simState.bankRad, simState.yawRate, speed, qScale);
  // Ground de-crab: on the wheels the lateral axis is stable, so firmly steer the
  // nose onto the runway heading (P on heading error + yaw-rate damping). This
  // straightens out the touchdown crab during the rollout.
  const groundDecrabYaw = clamp(
    wrapPi(courseHeading - simState.headingRad) * GROUND_DECRAB_GAIN - GROUND_DECRAB_DAMP * (simState.yawRate || 0),
    -0.7, 0.7);

  // Vertical: reuse the PROVEN-stable cruise longitudinal control (pitch holds the
  // target altitude with a hard speed guard, throttle holds airspeed) but feed it a
  // glideslope target altitude that descends to 0 at the touchdown point. Because
  // it's the same loop that holds cruise rock-solid, the descent never stalls.
  // Cap the glideslope target at the current altitude so the approach never
  // commands a CLIMB (which, with reduced power, would stall): it holds level
  // until the descending slope reaches it, then follows it down. Capture from above.
  const glideAGL = Math.min(distToTD * Math.tan(GLIDESLOPE), APPROACH_ALT, altAGL);
  const dy = (glideAGL + (simState.groundOffset || GROUND_OFFSET)) - simState.y; // target − current alt

  // ----- ROLLOUT: on the ground — full flaps + SPOILERS to brake aerodynamically
  // (spoilers dump lift onto the wheels and add drag), idle power, then DONE.
  if (altAGL < 1.5) {
    if (speed < 20) { phase = 'DONE'; currentSeq = mission.items.length; }
    else phase = 'ROLLOUT';
    // Ground roll: de-crab — steer the nose straight down the runway, wings level.
    return { pitch: 0, roll: levelRoll * qScale, yaw: groundDecrabYaw, throttle: 0, flaps: 1, spoilers: 1 };
  }

  if (altAGL < FLARE_ALT) landingCommitted = true; // committed to land — no climb-back

  let desiredPitch, throttleCmd;
  if (landingCommitted && altAGL >= FLARE_ALT) {
    phase = 'FLARE';
    desiredPitch = -0.05;                        // ballooned → put it back down
    throttleCmd = 0;
  } else if (altAGL < FLARE_ALT) {
    phase = 'FLARE';
    desiredPitch = FLARE_PITCH * clamp((FLARE_ALT - altAGL) / FLARE_ALT, 0, 1);
    throttleCmd = 0;
  } else {
    phase = 'APPROACH';
    desiredPitch = clamp(dy * ALT_TO_PITCH - VS_DAMP * clamp(simState.vy / VS_SCALE, -1, 1), -MAX_PITCH, MAX_PITCH);
    if (speed < LANDING_SAFE) desiredPitch = Math.min(desiredPitch, (speed - LANDING_SAFE) * SPEED_PROT_GAIN);
    throttleCmd = clamp(THR_TRIM + (APPROACH_SPEED - speed) * THR_SPEED_GAIN + Math.max(0, dy) * THR_CLIMB_FF, 0.1, 1.0);
  }
  const pitchCmd = clamp(
    (desiredPitch - simState.pitchRad) * PITCH_KP - simState.pitchRate * PITCH_RATE_KD,
    PITCH_LIMIT_DOWN, PITCH_LIMIT_UP,
  );

  // Progressive flaps: only PARTIAL flap on the long approach (full landing flap
  // there is so much drag the aircraft can't hold speed through a crosswind
  // correction and bleeds into a stall); full flap only on short final for the
  // flare. Keeps approach energy up so the localiser correction never departs.
  const approachFlap = altAGL < APPROACH_FLAP_ALT ? 1 : 0.5;
  // Airborne: keep the PROVEN coordinated flare untouched. The flare is laterally
  // marginal at this slow, low-energy state — ANY de-crab rudder in the air tips it
  // into a directional divergence (verified). So the nose is de-crabbed on the GROUND
  // roll instead (ROLLOUT branch above), where the wheels give lateral stability.
  const finalRoll = rollCmd;
  const finalYaw = dampedYaw(finalRoll);
  return {
    pitch: pitchCmd * qScale, roll: finalRoll * qScale,
    yaw: finalYaw, throttle: throttleCmd, flaps: approachFlap, spoilers: 0,
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
