// Bootstrap + main loop. Owns the simulation state and ticks every subsystem.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.

import { buildWorld, RUNWAY_START_Z } from './world.js';
import { buildAircraft } from './aircraft.js';
import { createCameraRig, nextMode, updateCamera } from './camera.js';
import { createControlState, attachKeyboard, tickThrottle } from './controls.js';
import { initHud, updateHud } from './hud.js';
import { maybeSend, isBridgeOnline, mergeMeasuredIntoTelemetry } from './telemetry.js';
import * as autopilot from './autopilot.js';
import { connect as connectMissionLink } from './missionLink.js';
import {
  createColliders,
  checkAircraft,
  classifyHit,
} from './collision.js';
import {
  createDamageState, applyHit, isCrashed, totalIntegrity,
  liftMultiplier, thrustMultiplier, controlMultiplier,
} from './damage.js';
import { createEffects, tickEffects, emitBurst } from './effects.js';
import {
  createRecorder, isRecording, isReplaying,
  startRecording, stopRecording, recordSnapshot,
  beginReplay, endReplay, findAt, getSnapshots, toCSV, clear as clearRecorder,
} from './recorder.js';
import * as hitl from './hitl.js';
import * as audio from './audio.js';
import { pollGamepad, isConnected as isPadConnected } from './gamepad.js';
import { spawnTraffic, tickTraffic } from './aiTraffic.js';
import * as scenario from './scenario.js';
import * as drone from './drone.js';
import * as mp from './multiplayer.js';
import { getEventSource } from './missionLink.js';
import {
  airDensity,
  liftCoefficient,
  dragCoefficient,
  liftForce,
  dragForce,
  angleOfAttack,
  sideslipAngle,
  aeroMoments,
  bodyAngularAccel,
  sideForce,
  INERTIA,
  GRAVITY,
  STALL_AOA_RAD,
} from './physics.js';
import { DT_PHYS, MAX_SUBSTEPS, planSteps, rk4Step } from './fixedStep.js';
import { stepActuator } from './actuators.js';
import { makeRng, stepSensor } from './sensors.js';
import { createKF, kfStepGated } from './estimator.js';
import { buildDemoMission } from './missions.js';

const THREE = window.THREE;

// ---------- Renderer / scene / camera ----------

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

// WebXR: enable XR rendering pipeline. A small button in the lower right of
// the page requests an immersive-vr session when clicked.
if (renderer.xr) renderer.xr.enabled = true;

if (typeof navigator !== 'undefined' && navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) return;
    const btn = document.createElement('button');
    btn.textContent = 'Enter VR';
    btn.style.cssText =
      'position:fixed;right:18px;bottom:18px;z-index:20;' +
      'padding:8px 16px;font:600 12px ui-monospace, Menlo, monospace;' +
      'letter-spacing:1px;color:#ffb000;background:rgba(0,0,0,0.55);' +
      'border:1px solid #ffb000;cursor:pointer;';
    btn.addEventListener('click', async () => {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor'],
        });
        renderer.xr.setSession(session);
        btn.textContent = 'Exit VR';
        session.addEventListener('end', () => { btn.textContent = 'Enter VR'; });
      } catch (e) {
        console.warn('[xr] session start failed:', e.message);
      }
    });
    document.body.appendChild(btn);
  }).catch(() => { /* XR unavailable */ });
}

const scene = new THREE.Scene();
const colliders = createColliders();
buildWorld(scene, colliders);
const effects = createEffects(scene);

const camera = new THREE.PerspectiveCamera(
  65, window.innerWidth / window.innerHeight, 0.1, 20000,
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// ---------- Aircraft + sim state ----------

const aircraft = buildAircraft();
scene.add(aircraft);

// Cessna-class params.
const AIRCRAFT = {
  mass: 1000,        // kg
  wingArea: 16,      // m^2
  span: 11,          // m  (AR ≈ 7.5)
  chord: 1.46,       // m  (= wingArea / span, mean aerodynamic chord)
  maxThrust: 4500,   // N (peak engine thrust at full throttle)
  // Roll stability augmentation: gentle restoring roll moment toward wings-level
  // when the pilot isn't commanding roll. Real airframes are not bank-stable;
  // this is an explicit SAS for flyability (sanctioned by PRD §9 risk table).
  // Expressed as an extra roll-moment coefficient per radian of bank.
  rollSAS: 0.25,
};

// ---------- HILS I/O layer (M9): actuator + sensor models + fault injection ----------
// Actuator config: realistic but near-ideal so nominal flight feel is preserved.
const ACTUATOR_CFG = { bandwidth: 25, rateLimit: 10, min: -1, max: 1 };
// Sensor error config per channel (bias/scale/noise σ in the channel's unit,
// bandwidth = lag). Tuned to plausible light-aircraft avionics; sensors are an
// observation tap (not in the control loop), so noise never destabilizes flight.
const SENSOR_CFG = {
  airspeed: { noise: 0.4, bandwidth: 8 },    // m/s  (pitot, some lag)
  altitude: { noise: 0.6, bandwidth: 6 },    // m    (baro, laggy)
  // IMU channels: zero lag (bandwidth Infinity by default). Real gyros/accels run
  // far faster than the control loop; any lag here erodes phase margin and
  // destabilizes the fast inner loop. Small noise only.
  pitch:    { noise: 0.05 },  // deg
  roll:     { noise: 0.05 },  // deg
  heading:  { noise: 0.1 },   // deg
  p:        { noise: 0.15 },  // deg/s (IMU gyro)
  q:        { noise: 0.15 },
  r:        { noise: 0.15 },
  gpsX:     { noise: 1.5, bandwidth: 8 },     // m    (GPS, modest lag)
  gpsZ:     { noise: 1.5, bandwidth: 8 },
};
// Fault registry — null = healthy. Inject from the console:
//   injectFault('elevator', {type:'stuck'})        // actuator
//   injectFault('altitude', {type:'bias', value:50}) // sensor
//   injectFault('gpsX', {type:'frozen'})  /  clearFaults()
const hilsFaults = {};
const sensorRng = makeRng(0xC0FFEE);       // seeded → deterministic noise
let measured = {};                         // latest measured (sensor) values

// Sensor-in-the-loop (M11/M18): the autopilot flies on the navigation SOURCE below.
//   'truth'     — perfect state (debug / comparison)
//   'measured'  — raw sensor values fed straight to the controller
//   'estimated' — GPS+IMU fused by a gated Kalman estimator (default)
// Default is 'estimated': AUTO flies the full coordinated circuit on FUSED SENSOR
// data, not truth — the genuine HILS mode. The estimator (M13 FDE) rejects GPS
// spoofs, so injected jamming/spoofing is handled live mid-mission.
let navSource = 'estimated';
const DEG2RAD = Math.PI / 180;
let kfX = createKF(), kfZ = createKF(), kfY = createKF();
let navEstimate = null;                    // { estimated, measured } autopilot inputs
let navDegraded = false;                   // FDE: GPS measurements being rejected
let navDegradedHold = 0;                   // frames to hold the warning (hysteresis)
let gpsRejectStreak = 0;                    // consecutive rejected frames → sustained fault

if (typeof window !== 'undefined') {
  window.injectFault = (target, fault) => { hilsFaults[target] = fault || null; };
  window.clearFaults = () => { for (const k of Object.keys(hilsFaults)) delete hilsFaults[k]; };
  window.setNavSource = (s) => { if (['truth', 'measured', 'estimated'].includes(s)) navSource = s; };
  window.__hils = {
    get measured() { return measured; },
    get actuators() { return sim.actuators; },
    get faults() { return hilsFaults; },
    get navSource() { return navSource; },
    get nav() { return navEstimate; },
    get navDegraded() { return navDegraded; },
    get auto() {
      return {
        active: autopilot.isActive(), phase: autopilot.getPhase(),
        seq: autopilot.getCurrentSeq(), len: autopilot.getMissionLength(),
      };
    },
  };
}

const sim = {
  // World-frame state.
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  // Orientation as quaternion; we apply body-frame angular rates to it.
  orientation: new THREE.Quaternion(),
  // Body angular velocity (rad/s) in body frame.
  omega: new THREE.Vector3(0, 0, 0),

  // Actuator surface positions (normalized) — lag behind the commands.
  actuators: { elevator: 0, aileron: 0, rudder: 0 },

  status: 'OK', // OK | STALL | CRASH
  vsi: 0,
  gForce: 1.0,

  damage: createDamageState(),

  // For roll/pitch readout from quaternion.
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
};

// Approximate aircraft bounding sphere radius for obstacle collision.
const AIRCRAFT_RADIUS = 5.5;

// AI traffic populates the airspace.
const aiList = spawnTraffic(scene, 5);

// Spare drone mesh (hidden until vehicle toggle). Built lazily.
let droneMesh = null;
let vehicleType = 'plane';   // 'plane' | 'drone'

// ---------- Recorder + HITL ----------

const recorder = createRecorder({ capacity: 36000 }); // 30 min @ 20 Hz
let replayStartT = 0;
let replayClockMs = 0;
let hitlEngaged = false;
const _hitlQuat = new THREE.Quaternion();

// Cooldowns / timing for emitter rates.
let lastSmokeAt = 0;
let lastFireAt = 0;
let lastExhaustAt = 0;
let strobeT = 0;

// ---------- Controls + HUD + camera rig ----------

const controls = createControlState();
const camRig = createCameraRig();

controls.onReset = () => resetAircraft();
controls.onCameraToggle = () => nextMode(camRig);
controls.onMissionStart = () => {
  if (autopilot.hasMission()) {
    autopilot.startMission();
    console.log('[sim] mission started locally (M key)');
  } else {
    console.log('[sim] no mission loaded — upload a plan from QGC first');
  }
};
controls.onDemoMission = () => {
  // Load + start the built-in circuit so AUTO mode is flyable without QGC (K key).
  const m = buildDemoMission(HOME);
  autopilot.setMission(m.items, m.home);
  autopilot.startMission();
  console.log(`[sim] demo mission started (K key) — ${m.items.length} waypoints, flying on '${navSource}' nav`);
};
if (typeof window !== 'undefined') window.loadDemoMission = () => controls.onDemoMission();
controls.onMissionAbort = () => {
  if (autopilot.isActive()) {
    autopilot.abort();
    console.log('[sim] mission aborted (N key)');
  }
};
controls.onRecToggle = () => {
  if (isRecording(recorder)) {
    stopRecording(recorder);
    console.log(`[recorder] stopped — ${getSnapshots(recorder).length} snapshots held`);
  } else {
    if (isReplaying(recorder)) endReplay(recorder);
    clearRecorder(recorder);
    startRecording(recorder);
    console.log('[recorder] recording…');
  }
};
controls.onReplayToggle = () => {
  if (isReplaying(recorder)) {
    endReplay(recorder);
    console.log('[recorder] replay off');
    return;
  }
  const snaps = getSnapshots(recorder);
  if (snaps.length < 2) {
    console.log('[recorder] nothing to replay');
    return;
  }
  beginReplay(recorder);
  replayStartT = snaps[0].t;
  replayClockMs = 0;
  console.log(`[recorder] replay ON — ${snaps.length} snapshots, ${(snaps[snaps.length-1].t - snaps[0].t)/1000}s`);
};
controls.onHitlToggle = () => {
  hitlEngaged = !hitlEngaged;
  console.log(`[hitl] ${hitlEngaged ? 'ENGAGED — physics off, mesh follows external state' : 'released'}`);
};
controls.onAudioToggle = () => {
  const on = audio.toggleEnabled();
  console.log(`[audio] ${on ? 'on' : 'muted'}`);
};
controls.onVehicleToggle = () => {
  if (vehicleType === 'plane') {
    if (!droneMesh) { droneMesh = drone.buildDrone(); scene.add(droneMesh); }
    aircraft.visible = false;
    droneMesh.visible = true;
    vehicleType = 'drone';
    sim.position.set(0, 1.0, 0);
    sim.velocity.set(0, 0, 0);
    sim.orientation.identity();
    sim.omega.set(0, 0, 0);
    controls.throttle = 0.5;  // hover-ish
  } else {
    aircraft.visible = true;
    if (droneMesh) droneMesh.visible = false;
    vehicleType = 'plane';
    resetAircraft();
  }
  console.log(`[vehicle] now ${vehicleType}`);
};
let scenarioIndex = 0;
controls.onScenarioCycle = () => {
  const list = scenario.listCourses();
  scenarioIndex = (scenarioIndex + 1) % list.length;
  console.log(`[scenario] selected: ${list[scenarioIndex].name} — press G to start`);
};
controls.onScenarioStart = () => {
  const s = scenario.startCourse(scenarioIndex);
  if (s) console.log(`[scenario] started: ${scenario.listCourses()[scenarioIndex].name}`);
};
controls.onMultiplayerToggle = () => {
  mp.setActive(!mp.isActive());
  console.log(`[multiplayer] ${mp.isActive() ? 'on (peerId=' + mp.getPeerId() + ')' : 'off'}`);
};
controls.onCsvExport = () => {
  const csv = toCSV(recorder);
  if (!csv) { console.log('[recorder] no data to export'); return; }
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `flight-${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  console.log('[recorder] CSV exported');
};

attachKeyboard(controls);
initHud();

// Audio needs a user gesture before AudioContext can run.
function bootAudioOnce() {
  audio.start();
  window.removeEventListener('keydown',   bootAudioOnce);
  window.removeEventListener('mousedown', bootAudioOnce);
  window.removeEventListener('touchstart', bootAudioOnce);
}
window.addEventListener('keydown',   bootAudioOnce);
window.addEventListener('mousedown', bootAudioOnce);
window.addEventListener('touchstart', bootAudioOnce);

// Subscribe to bridge's command stream (mission uploads, mode changes).
// HOME defaults match bridge/server.mjs (RKSI).
const HOME = { lat: 37.4602, lon: 126.4407, alt: 7 };
connectMissionLink(HOME);
// Multiplayer shares the same SSE pipe.
{
  const es = getEventSource();
  if (es) mp.attach(es);
}

function resetAircraft() {
  sim.position.set(0, aircraft.userData.gearOffset, RUNWAY_START_Z);
  sim.velocity.set(0, 0, 0);
  sim.orientation.identity();
  sim.omega.set(0, 0, 0);
  sim.actuators.elevator = sim.actuators.aileron = sim.actuators.rudder = 0;
  kfX = createKF(sim.position.x); kfZ = createKF(sim.position.z); kfY = createKF(0);
  navEstimate = null; measured = {}; navDegraded = false; navDegradedHold = 0; gpsRejectStreak = 0;
  sim.status = 'OK';
  sim.vsi = 0;
  sim.gForce = 1.0;
  controls.throttle = 0;
  // Reset damage + restore visual parts hidden during the previous run.
  sim.damage = createDamageState();
  if (aircraft.userData.parts) {
    aircraft.userData.parts.leftWing.visible = true;
    aircraft.userData.parts.rightWing.visible = true;
    aircraft.userData.parts.tail.visible = true;
  }
  syncMesh();
}

function syncMesh() {
  const m = vehicleType === 'drone' && droneMesh ? droneMesh : aircraft;
  m.position.copy(sim.position);
  m.quaternion.copy(sim.orientation);
}

function getActiveVehicleMesh() {
  return vehicleType === 'drone' && droneMesh ? droneMesh : aircraft;
}

resetAircraft();

// ---------- Loop ----------

const tmpForward = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();
const tmpAccel = new THREE.Vector3();
let prevAccelMag = GRAVITY;

let last = performance.now();
let physAccum = 0; // unsimulated time carried between frames (fixed-step accumulator)

function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  // Visual dt clamp (camera/effects/prop spin) for tab-refocus hitches. Physics
  // no longer rides this dt — it advances in fixed DT_PHYS sub-steps (M7), with
  // MAX_SUBSTEPS as its own spiral-of-death guard.
  dt = Math.min(dt, 0.1);

  // Replay mode: physics is paused; pose is read from the recorder buffer.
  if (isReplaying(recorder)) {
    replayClockMs += dt * 1000;
    const snap = findAt(recorder, replayStartT + replayClockMs);
    if (snap) applySnapshotToSim(snap);
    syncMesh();
    if (aircraft.userData.prop) aircraft.userData.prop.rotation.z += dt * 30; // visual idle spin
    tickEffects(effects, dt);
    updateCamera(camera, getActiveVehicleMesh(), camRig, dt);
    pushHud();
    renderer.render(scene, camera);
    
    return;
  }

  // HITL mode: outside producer drives the pose.
  if (hitlEngaged) {
    const ext = hitl.getLatest();
    if (ext) applyExternalState(ext);
    syncMesh();
    if (aircraft.userData.prop) {
      const t = (ext && typeof ext.throttle01 === 'number') ? ext.throttle01 : controls.throttle;
      aircraft.userData.prop.rotation.z += dt * (10 + t * 60);
    }
    emitOngoingEffects(now);
    tickEffects(effects, dt);
    updateCamera(camera, getActiveVehicleMesh(), camRig, dt);
    pushHud();
    renderer.render(scene, camera);
    
    return;
  }

  if (!controls.paused && sim.status !== 'CRASH') {
    tickThrottle(controls, dt);

    // Gamepad: per-axis override (only the axes the user is actually pushing,
    // so keyboard remains usable for centered axes / triggers).
    const pad = pollGamepad();
    if (pad) {
      if (Math.abs(pad.roll)  > 0.05) controls.roll  = pad.roll;
      if (Math.abs(pad.pitch) > 0.05) controls.pitch = pad.pitch;
      if (Math.abs(pad.yaw)   > 0.05) controls.yaw   = pad.yaw;
      if (pad.throttle !== null)      controls.throttle = pad.throttle;
    }

    // Sense → estimate → control (M11). Update the sensor model and the nav
    // estimate first, so the autopilot flies on the selected navSource.
    updateSensors(dt);
    updateNavEstimate(dt);

    // Autopilot override (AUTO mission). Computed before stepPhysics so the
    // physics layer just sees control inputs as usual.
    //
    // Truth attitude is computed directly from the orientation so the bank/pitch
    // sign convention is unambiguous:
    //   bank   > 0 when the right wing is down (matches CLAUDE.md §3)
    //   pitch  > 0 when the nose is up
    const fwdAP = tmpForward.set(0, 0, -1).applyQuaternion(sim.orientation);
    const rightAP = tmpRight.set(1, 0, 0).applyQuaternion(sim.orientation);
    const truthAP = {
      x: sim.position.x, y: sim.position.y, z: sim.position.z,
      vx: sim.velocity.x, vy: sim.velocity.y, vz: sim.velocity.z,
      headingRad: Math.atan2(fwdAP.x, -fwdAP.z),
      pitchRad: Math.asin(Math.max(-1, Math.min(1, fwdAP.y))),
      bankRad: -Math.asin(Math.max(-1, Math.min(1, rightAP.y))),
      // Body +X = right wing → ω.x = nose pitch rate. Body −Z = nose; +ω.z =
      // LEFT roll, so right-roll rate = −ω.z. ω.y = yaw-right rate.
      pitchRate: sim.omega.x,
      rollRate: -sim.omega.z,
      yawRate: sim.omega.y,
      beta: sideslipAngle(sim.velocity, fwdAP, rightAP), // for turn coordination
    };
    // Pick what the autopilot actually sees: truth, raw sensors, or fused estimate.
    const apInput = (navSource === 'truth' || !navEstimate)
      ? truthAP
      : navEstimate[navSource];
    const apOut = autopilot.tick(apInput, dt);
    if (apOut) {
      controls.pitch = apOut.pitch;
      controls.roll = apOut.roll;
      controls.yaw = apOut.yaw;
      controls.throttle = apOut.throttle;
    }

    // Deterministic fixed-step integration (M7): advance physics in fixed
    // DT_PHYS increments regardless of render frame rate, so (state + inputs) →
    // identical trajectory. Controls sampled above are zero-order-held across the
    // sub-steps of this frame. See src/fixedStep.js / PRD §M7.
    physAccum += dt;
    const plan = planSteps(physAccum, DT_PHYS, MAX_SUBSTEPS);
    physAccum = plan.remainder;
    if (plan.dropped > 0.25) {
      console.warn(`[fixedStep] shed ${plan.dropped.toFixed(2)}s of sim time (frame hitch)`);
    }
    for (let i = 0; i < plan.steps; i++) {
      if (vehicleType === 'drone') {
        drone.stepDrone(sim, controls, DT_PHYS, GRAVITY);
      } else {
        stepPhysics(DT_PHYS);
      }
    }
  }

  // Tick AI traffic regardless of vehicle / pause state — gives the world life.
  tickTraffic(aiList, dt);

  // Scenario tick (if active) advances objectives + scores.
  scenario.tickScenario({
    x: sim.position.x, y: sim.position.y, z: sim.position.z,
    altitude: Math.max(0, sim.position.y - aircraft.userData.gearOffset),
  }, now);

  // Spin propeller proportional to throttle. When the engine is destroyed,
  // it stops dead; when damaged it sputters.
  if (vehicleType === 'plane' && aircraft.userData.prop) {
    const eng = sim.damage.engine;
    aircraft.userData.prop.rotation.z += dt * (eng <= 0.05 ? 0 : (10 + controls.throttle * 60) * eng);
  }
  if (vehicleType === 'drone' && droneMesh) {
    drone.spinDroneProps(droneMesh, dt, controls.throttle);
  }

  // Multiplayer outbound — broadcast our pose at 10 Hz when enabled.
  if (mp.isActive()) {
    const q = sim.orientation;
    mp.maybeSend({
      x: sim.position.x, y: sim.position.y, z: sim.position.z,
      qx: q.x, qy: q.y, qz: q.z, qw: q.w,
      vehicle: vehicleType,
    }, now);
  }
  // Update peer ghosts (cheap NPC mesh).
  mp.tickPeers(scene, () => {
    // Reuse the same NPC visual as AI traffic.
    const ghost = (function() {
      const g = new THREE.Group();
      g.add(aircraft.clone(true));
      g.scale.setScalar(0.85);
      return g;
    })();
    return ghost;
  }, dt);

  // Anti-collision strobe on the tail — alternates every 0.6 s.
  strobeT += dt;
  if (aircraft.userData.parts && aircraft.userData.parts.tailStrobe) {
    aircraft.userData.parts.tailStrobe.visible = ((strobeT * 1.6) % 1) < 0.5;
  }

  syncMesh();
  emitOngoingEffects(now);
  tickEffects(effects, dt);
  updateCamera(camera, getActiveVehicleMesh(), camRig, dt);

  // Audio: continuous channels follow the live sim state.
  audio.setEngine(controls.throttle, sim.damage.engine);
  audio.setWind(sim.velocity.length());
  audio.setStall(sim.status === 'STALL', dt);

  pushHud();

  // Snapshot the live state every frame; recorder ignores it when stopped.
  if (isRecording(recorder)) {
    recordSnapshot(recorder, takeSnapshot());
  }

  renderer.render(scene, camera);
  
}

function takeSnapshot() {
  const q = sim.orientation;
  return {
    t: performance.now(),
    x: sim.position.x, y: sim.position.y, z: sim.position.z,
    vx: sim.velocity.x, vy: sim.velocity.y, vz: sim.velocity.z,
    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    speed: sim.velocity.length(),
    altitude: Math.max(0, sim.position.y - aircraft.userData.gearOffset),
    throttle01: controls.throttle,
    aoa: sim._aoa || 0,
    gForce: sim.gForce,
    vsi: sim.vsi,
    fusHp: sim.damage.fuselage,
    lWingHp: sim.damage.leftWing,
    rWingHp: sim.damage.rightWing,
    tailHp: sim.damage.tail,
    engHp: sim.damage.engine,
    status: sim.status,
  };
}

function applySnapshotToSim(snap) {
  sim.position.set(snap.x, snap.y, snap.z);
  sim.velocity.set(snap.vx || 0, snap.vy || 0, snap.vz || 0);
  if (snap.qw != null) {
    sim.orientation.set(snap.qx, snap.qy, snap.qz, snap.qw);
  }
  sim.vsi = snap.vsi || 0;
  sim._aoa = snap.aoa || 0;
}

function applyExternalState(ext) {
  if (typeof ext.x === 'number') sim.position.x = ext.x;
  if (typeof ext.y === 'number') sim.position.y = ext.y;
  if (typeof ext.z === 'number') sim.position.z = ext.z;
  if (typeof ext.vx === 'number') sim.velocity.x = ext.vx;
  if (typeof ext.vy === 'number') sim.velocity.y = ext.vy;
  if (typeof ext.vz === 'number') sim.velocity.z = ext.vz;
  if (typeof ext.qw === 'number') {
    sim.orientation.set(ext.qx, ext.qy, ext.qz, ext.qw);
  } else if (typeof ext.yawRad === 'number') {
    // Euler fallback: build from yaw/pitch/roll. YXZ.
    const e = new THREE.Euler(ext.pitchRad || 0, ext.yawRad || 0, ext.rollRad || 0, 'YXZ');
    sim.orientation.setFromEuler(e);
  }
  if (typeof ext.throttle01 === 'number') controls.throttle = ext.throttle01;
  if (typeof ext.vsi === 'number') sim.vsi = ext.vsi;
}

const _emitTmp = new THREE.Vector3();

function emitOngoingEffects(now) {
  // Exhaust trail when the engine is producing thrust.
  if (controls.throttle > 0.02 && sim.damage.engine > 0.05 && now - lastExhaustAt > 35) {
    lastExhaustAt = now;
    aircraft.localToWorld(_emitTmp.copy(aircraft.userData.anchors.exhaust));
    // Eject puffs backward (body +Z) from the aircraft.
    const back = tmpForward.set(0, 0, 1).applyQuaternion(sim.orientation);
    effects.exhaust.emit(
      _emitTmp.x, _emitTmp.y, _emitTmp.z,
      sim.velocity.x + back.x * 4 + (Math.random() - 0.5) * 1,
      sim.velocity.y + back.y * 4 + (Math.random() - 0.5) * 1,
      sim.velocity.z + back.z * 4 + (Math.random() - 0.5) * 1,
      0.6,
    );
  }

  // Per-component damage smoke (thicker as HP drops).
  for (const [name, hpKey] of [['leftWing','leftWing'],['rightWing','rightWing'],['tail','tail'],['engine','engine']]) {
    const hp = sim.damage[hpKey];
    if (hp >= 0.95) continue;
    const interval = 30 + hp * 220;          // ms between puffs
    const lastKey = '_smokeAt_' + name;
    if (now - (sim[lastKey] || 0) < interval) continue;
    sim[lastKey] = now;
    aircraft.localToWorld(_emitTmp.copy(aircraft.userData.anchors[name]));
    effects.smoke.emit(
      _emitTmp.x, _emitTmp.y, _emitTmp.z,
      sim.velocity.x * 0.3, sim.velocity.y * 0.3 + 0.5, sim.velocity.z * 0.3,
      2.5,
    );
  }

  // Fire on engine when its HP drops below 0.4.
  if (sim.damage.engine < 0.4 && now - lastFireAt > 60) {
    lastFireAt = now;
    aircraft.localToWorld(_emitTmp.copy(aircraft.userData.anchors.engine));
    effects.fire.emit(
      _emitTmp.x, _emitTmp.y, _emitTmp.z,
      0, 1.5, 0, 2.5,
    );
  }
}

function stepPhysics(dt) {
  // --- 1. Aerodynamic state from the current orientation ---
  // (body axes BEFORE this step's rotation; forces below recompute them after.)
  tmpForward.set(0, 0, -1).applyQuaternion(sim.orientation);
  tmpUp.set(0, 1, 0).applyQuaternion(sim.orientation);
  tmpRight.set(1, 0, 0).applyQuaternion(sim.orientation);

  const rhoNow = airDensity(Math.max(0, sim.position.y));
  const vRel = sim.velocity.length();
  let aoaNow = 0, betaNow = 0;
  if (vRel > 0.5) {
    aoaNow = angleOfAttack(sim.velocity, tmpForward, tmpUp);
    betaNow = sideslipAngle(sim.velocity, tmpForward, tmpRight);
  }
  const qbar = 0.5 * rhoNow * vRel * vRel;
  const ctrl = controlMultiplier(sim.damage); // damaged tail reduces authority

  // --- 2. Moment-based rotational dynamics (Euler's equation, RK4-integrated) ---
  // Controls become surface deflections; aerodynamic + gyroscopic moments and the
  // inertia tensor produce angular acceleration. We work in aviation rates
  // (p=roll-right, q=pitch-up, r=yaw-right) then map back to sim body ω.
  //
  // Commands pass through the actuator model first (rate/bandwidth/limits + any
  // injected fault), so what the airframe sees lags the stick — and a stuck or
  // floating surface behaves accordingly. ctrl is the damage-authority multiplier.
  const act = sim.actuators;
  act.elevator = stepActuator(act.elevator, controls.pitch, dt, ACTUATOR_CFG, hilsFaults.elevator);
  act.aileron  = stepActuator(act.aileron,  controls.roll,  dt, ACTUATOR_CFG, hilsFaults.aileron);
  act.rudder   = stepActuator(act.rudder,   controls.yaw,   dt, ACTUATOR_CFG, hilsFaults.rudder);
  const elevator = act.elevator * ctrl;
  const aileron  = act.aileron  * ctrl;
  const rudder   = act.rudder   * ctrl;

  // Roll SAS: gentle restoring roll moment toward wings-level when the pilot
  // isn't commanding roll (real airframes aren't bank-stable). Scaled by qbar so
  // it fades at low speed / on the ground. PRD §9 sanctions this augmentation.
  sim.euler.setFromQuaternion(sim.orientation, 'YXZ');
  const bank = sim.euler.z;
  const sasRoll = (controls.roll === 0)
    ? -AIRCRAFT.rollSAS * qbar * AIRCRAFT.wingArea * AIRCRAFT.span * bank
    : 0;

  const omegaDeriv = (_t, y) => {
    const [p, q, r] = y;
    const m = aeroMoments({
      qbar, S: AIRCRAFT.wingArea, span: AIRCRAFT.span, chord: AIRCRAFT.chord, V: vRel,
      alpha: aoaNow, beta: betaNow, p, q, r, elevator, aileron, rudder,
    });
    const a = bodyAngularAccel({ p, q, r }, { L: m.L + sasRoll, M: m.M, N: m.N }, INERTIA);
    return [a.dp, a.dq, a.dr];
  };

  const [p1, q1, r1] = rk4Step([-sim.omega.z, sim.omega.x, sim.omega.y], 0, dt, omegaDeriv);
  sim.omega.x = q1;   // q  → pitch-up about body +X
  sim.omega.y = r1;   // r  → yaw-right about body +Y
  sim.omega.z = -p1;  // p  → roll-right is −ω.z

  // --- 2b. Integrate orientation ---
  const w = sim.omega;
  // Quaternion derivative: q' = 0.5 * q * (0, ω_body)
  const wq = new THREE.Quaternion(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 1);
  sim.orientation.multiply(wq).normalize();

  // --- 3. Body axes in world frame ---
  tmpForward.set(0, 0, -1).applyQuaternion(sim.orientation);
  tmpUp.set(0, 1, 0).applyQuaternion(sim.orientation);
  tmpRight.set(1, 0, 0).applyQuaternion(sim.orientation);

  // --- 4. Aerodynamic forces ---
  const altitude = Math.max(0, sim.position.y);
  const rho = airDensity(altitude);
  const v = sim.velocity.length();

  let aoa = 0;
  if (v > 0.5) {
    aoa = angleOfAttack(sim.velocity, tmpForward, tmpUp);
  }
  const cl = liftCoefficient(aoa);
  const cd = dragCoefficient(cl);
  // Wing damage reduces total lift; if the two wings are unequal, the
  // imbalance produces a roll moment toward the weaker side.
  const lMul = liftMultiplier(sim.damage, 'left');
  const rMul = liftMultiplier(sim.damage, 'right');
  const totalWingMul = (lMul + rMul) * 0.5;
  const Lmag = liftForce({ rho, v, area: AIRCRAFT.wingArea, cl }) * totalWingMul;
  const Dmag = dragForce({ rho, v, area: AIRCRAFT.wingArea, cd });

  // Lift acts perpendicular to velocity, in the plane containing body up.
  const liftDir = tmpVec.copy(tmpUp);
  if (v > 0.5) {
    const vHat = sim.velocity.clone().multiplyScalar(1 / v);
    const projection = vHat.clone().multiplyScalar(tmpUp.dot(vHat));
    liftDir.copy(tmpUp).sub(projection);
    if (liftDir.lengthSq() < 1e-6) liftDir.copy(tmpUp);
    liftDir.normalize();
  }
  const liftVec = liftDir.clone().multiplyScalar(Lmag);

  // Asymmetric lift induces a roll: subtract a roll torque proportional to
  // wing-HP imbalance and current airspeed.
  const wingImbalance = rMul - lMul;
  if (Math.abs(wingImbalance) > 0.01 && v > 5) {
    // Negative ω.z = right roll (per stepPhysics convention). Strong wing on
    // the right → plane rolls toward the weaker (left) side.
    sim.omega.z += wingImbalance * v * 0.0015 * dt;
  }

  // Drag acts opposite velocity.
  const dragVec = new THREE.Vector3();
  if (v > 0.001) {
    dragVec.copy(sim.velocity).multiplyScalar(-Dmag / v);
  }

  // Thrust acts along nose forward (-Z body) in world frame.
  const thrust = AIRCRAFT.maxThrust * controls.throttle * thrustMultiplier(sim.damage);
  const thrustVec = tmpForward.clone().multiplyScalar(thrust);

  // Gravity (world).
  const gravityVec = new THREE.Vector3(0, -AIRCRAFT.mass * GRAVITY, 0);

  // Lateral side force from sideslip (completes 6-DOF translation): acts along
  // the body right axis, opposing the slip so turns become coordinated.
  const betaF = (v > 0.5) ? sideslipAngle(sim.velocity, tmpForward, tmpRight) : 0;
  const SY = sideForce({ qbar: 0.5 * rho * v * v, S: AIRCRAFT.wingArea, beta: betaF });
  const sideVec = tmpRight.clone().multiplyScalar(SY);

  // --- 5. Sum forces, integrate velocity & position ---
  tmpAccel.set(0, 0, 0)
    .add(liftVec).add(dragVec).add(thrustVec).add(gravityVec).add(sideVec)
    .multiplyScalar(1 / AIRCRAFT.mass);

  sim.velocity.addScaledVector(tmpAccel, dt);
  sim.position.addScaledVector(sim.velocity, dt);

  // --- 6a. Obstacle collision (buildings + mountains) ---
  const obsHit = checkAircraft(colliders, sim.position, AIRCRAFT_RADIUS);
  if (obsHit) {
    handleObstacleHit(obsHit);
  }

  // --- 6. Ground collision ---
  const groundY = aircraft.userData.gearOffset;
  if (sim.position.y <= groundY) {
    sim.position.y = groundY;
    // Bleed vertical velocity; if too hard → crash.
    if (sim.velocity.y < -8) {
      sim.status = 'CRASH';
      sim.velocity.multiplyScalar(0);
      sim.omega.set(0, 0, 0);
    } else {
      sim.velocity.y = Math.max(0, sim.velocity.y);
    }
    // On the ground: realistic rolling friction (μ ≈ 0.025 of weight).
    // Apply as a constant decel opposite horizontal velocity so the plane
    // can actually accelerate to takeoff speed.
    const horiz = Math.hypot(sim.velocity.x, sim.velocity.z);
    if (horiz > 0.01) {
      const rollMu = 0.025;
      const decel = rollMu * GRAVITY * dt;
      const k = Math.max(0, 1 - decel / horiz);
      sim.velocity.x *= k;
      sim.velocity.z *= k;
    }
    // Keep wings near-level on the ground (ROLL only). Don't touch pitch —
    // the pilot needs to be able to rotate to take off.
    const rollDampGround = 3;
    sim.omega.z *= Math.exp(-rollDampGround * dt);
  }

  // --- 7. Status / instruments ---
  sim.vsi = sim.velocity.y;
  // G-force ≈ |a_body_up| / g in steady state. We approximate using accel along body-up.
  const accelAlongUp = tmpAccel.dot(tmpUp) + GRAVITY * tmpUp.y; // remove gravity contribution
  const gNow = (accelAlongUp + GRAVITY) / GRAVITY;
  prevAccelMag = prevAccelMag + (gNow - prevAccelMag) * Math.min(1, dt * 4);
  sim.gForce = prevAccelMag;

  if (sim.status !== 'CRASH') {
    if (Math.abs(aoa) > STALL_AOA_RAD && v > 5) sim.status = 'STALL';
    else sim.status = 'OK';
  }

  sim._aoa = aoa;
}

function handleObstacleHit(hit) {
  // Push the aircraft out of the obstacle along the contact normal.
  sim.position.x += hit.nx * (hit.depth + 0.1);
  sim.position.y += hit.ny * (hit.depth + 0.1);
  sim.position.z += hit.nz * (hit.depth + 0.1);

  // Closing speed along the normal — drives damage severity.
  const vn = sim.velocity.x * hit.nx + sim.velocity.y * hit.ny + sim.velocity.z * hit.nz;
  const closingSpeed = Math.max(0, -vn); // m/s along inward normal
  // Reflect-and-bleed velocity (energy lost in the impact).
  if (vn < 0) {
    const restitution = 0.15;
    sim.velocity.x -= (1 + restitution) * vn * hit.nx;
    sim.velocity.y -= (1 + restitution) * vn * hit.ny;
    sim.velocity.z -= (1 + restitution) * vn * hit.nz;
  }
  sim.velocity.multiplyScalar(0.55);

  // Translate impact point to body frame to decide which component took it.
  const localImpact = new THREE.Vector3(hit.px, hit.py, hit.pz)
    .sub(sim.position)
    .applyQuaternion(sim.orientation.clone().invert());

  const part = classifyHit({
    localX: localImpact.x, localY: localImpact.y, localZ: localImpact.z,
  });
  // Severity: 0 at <8 m/s closing, ramps to 1 by ~80 m/s.
  const severity = Math.min(1.0, Math.max(0.05, (closingSpeed - 8) / 70));
  applyHit(sim.damage, part, severity);

  // Visual impact: spark burst at contact, aircraft kicked.
  emitBurst(effects.sparks, 18, hit.px, hit.py, hit.pz, hit.nx * 12, hit.ny * 12 + 3, hit.nz * 12, 10);
  emitBurst(effects.smoke,  6, hit.px, hit.py, hit.pz, 0, 1, 0, 4);
  audio.playImpact(0.4 + severity * 0.9);

  // Hide a wing/tail mesh once it's effectively gone — feels much more
  // dramatic than a slightly-tinted intact wing.
  if (sim.damage.leftWing  <= 0.05 && aircraft.userData.parts.leftWing.visible) {
    aircraft.userData.parts.leftWing.visible = false;
    emitBurst(effects.smoke, 30, hit.px, hit.py, hit.pz, 0, 4, 0, 8);
  }
  if (sim.damage.rightWing <= 0.05 && aircraft.userData.parts.rightWing.visible) {
    aircraft.userData.parts.rightWing.visible = false;
    emitBurst(effects.smoke, 30, hit.px, hit.py, hit.pz, 0, 4, 0, 8);
  }
  if (sim.damage.tail <= 0.05 && aircraft.userData.parts.tail.visible) {
    aircraft.userData.parts.tail.visible = false;
  }

  if (isCrashed(sim.damage)) {
    crash(hit.px, hit.py, hit.pz);
  }
}

function crash(x, y, z) {
  if (sim.status === 'CRASH') return;
  sim.status = 'CRASH';
  sim.velocity.multiplyScalar(0.1);
  sim.omega.set(0, 0, 0);
  emitBurst(effects.fire,   60, x, y, z, 0, 12, 0, 18);
  emitBurst(effects.smoke,  90, x, y, z, 0, 8, 0, 14);
  emitBurst(effects.sparks, 50, x, y, z, 0, 18, 0, 25);
  audio.playExplosion();
}

const SENSOR_RAD2DEG = 180 / Math.PI;
const _sensFwd = new THREE.Vector3();
const _sensRight = new THREE.Vector3();

// Compute the truth state and the corresponding measured (sensor) state, with
// per-channel error + any injected fault. Exposed via window.__hils; also feeds
// the autopilot through the estimator when navSource is 'measured'/'estimated'.
function updateSensors(dt) {
  _sensFwd.set(0, 0, -1).applyQuaternion(sim.orientation);
  _sensRight.set(1, 0, 0).applyQuaternion(sim.orientation);
  const truth = {
    airspeed: sim.velocity.length(),
    altitude: Math.max(0, sim.position.y - aircraft.userData.gearOffset),
    pitch: Math.asin(Math.max(-1, Math.min(1, _sensFwd.y))) * SENSOR_RAD2DEG,
    roll: -Math.asin(Math.max(-1, Math.min(1, _sensRight.y))) * SENSOR_RAD2DEG,
    heading: ((Math.atan2(_sensFwd.x, -_sensFwd.z) * SENSOR_RAD2DEG) + 360) % 360,
    p: -sim.omega.z * SENSOR_RAD2DEG,
    q: sim.omega.x * SENSOR_RAD2DEG,
    r: sim.omega.y * SENSOR_RAD2DEG,
    gpsX: sim.position.x,
    gpsZ: sim.position.z,
  };
  const next = {};
  for (const ch of Object.keys(SENSOR_CFG)) {
    const prev = (measured[ch] !== undefined) ? measured[ch] : truth[ch];
    next[ch] = stepSensor(prev, truth[ch], dt, SENSOR_CFG[ch], sensorRng, hilsFaults[ch]);
  }
  next._truth = truth;
  measured = next;
}

// Estimate the navigation state the autopilot flies on, from the measured
// sensors: GPS x/z/alt fused by a constant-velocity Kalman filter, attitude and
// rates low-passed. Produces both a raw 'measured' input and a fused 'estimated'
// input (selected by navSource). Run after updateSensors, before autopilot.tick.
function updateNavEstimate(dt) {
  const m = measured;
  if (m.gpsX === undefined) { navEstimate = null; return; }
  const gear = aircraft.userData.gearOffset;
  // Air-data sideslip (INS/vane) — same for both inputs; used for turn coordination.
  const beta = sideslipAngle(sim.velocity, _sensFwd, _sensRight);

  // GPS position is noisy and the nav loop is slow → fuse with a Kalman filter.
  // Attitude/rates come from the IMU with tiny noise; filtering them only adds
  // phase lag that destabilizes the fast inner control loop, so trust them raw
  // (an INS-trusts-attitude, GPS-filters-position split).
  // Gated Kalman (M13 FDE): a GPS jump/spoof/dropout produces a huge innovation,
  // gets rejected, and the filter coasts on its model instead of chasing the bad
  // fix. Persistent rejection raises NAV DEGRADED.
  const pX = kfX.x, pZ = kfZ.x, pY = kfY.x;
  const sx = kfStepGated(kfX, m.gpsX, dt, { q: 1.5, r: 2.5, gate: 16 });
  const sz = kfStepGated(kfZ, m.gpsZ, dt, { q: 1.5, r: 2.5, gate: 16 });
  const sy = kfStepGated(kfY, m.altitude, dt, { q: 1.0, r: 1.0, gate: 25 });

  // A coordinated turn briefly trips the gate (the constant-velocity model curves
  // away) — that's transient, not a fault, so the standard gated filter just coasts
  // one step and recovers. Only SUSTAINED rejection (a real spoof/jam) engages INS
  // dead-reckoning: integrate position on the confident INS velocity and cap the
  // covariance so the gate stays tight and keeps rejecting the spoof. This holds
  // the estimate on truth → the autopilot keeps its route.
  if (sx.rejected || sz.rejected || sy.rejected) gpsRejectStreak++;
  else gpsRejectStreak = 0;
  const sustained = gpsRejectStreak > 12;     // ~0.2 s of continuous rejection
  const insReckon = (kf, prevX, vel) =>
    (sustained && kf.rejected)
      ? { x: prevX + vel * dt, v: vel, P00: Math.min(kf.P00, 4), P01: 0, P10: 0, P11: Math.min(kf.P11, 1), rejected: true, nis: kf.nis }
      : kf;
  kfX = insReckon(sx, pX, sim.velocity.x);
  kfZ = insReckon(sz, pZ, sim.velocity.z);
  kfY = insReckon(sy, pY, sim.velocity.y);

  if (sustained) navDegradedHold = 90;
  else if (navDegradedHold > 0) navDegradedHold--;
  navDegraded = navDegradedHold > 0;

  navEstimate = {
    estimated: {
      x: kfX.x, y: kfY.x + gear, z: kfZ.x,
      // No dedicated velocity sensor — use the airframe velocity (an air-data /
      // INS-derived rate would stand in here). KF position is what carries the
      // GPS error/fault into the nav loop.
      vx: sim.velocity.x, vy: sim.velocity.y, vz: sim.velocity.z,
      headingRad: m.heading * DEG2RAD,
      pitchRad: m.pitch * DEG2RAD, bankRad: m.roll * DEG2RAD,
      pitchRate: m.q * DEG2RAD, rollRate: m.p * DEG2RAD, yawRate: m.r * DEG2RAD,
      beta,
    },
    measured: {
      x: m.gpsX, y: m.altitude + gear, z: m.gpsZ,
      vx: sim.velocity.x, vy: sim.velocity.y, vz: sim.velocity.z,
      headingRad: m.heading * DEG2RAD,
      pitchRad: m.pitch * DEG2RAD, bankRad: m.roll * DEG2RAD,
      pitchRate: m.q * DEG2RAD, rollRate: m.p * DEG2RAD, yawRate: m.r * DEG2RAD,
      beta,
    },
  };
}

function pushHud() {
  // Heading: world heading from forward vector projected onto XZ.
  const fwd = tmpForward.set(0, 0, -1).applyQuaternion(sim.orientation);
  const headingRad = Math.atan2(fwd.x, -fwd.z); // 0 = -Z (north-ish)
  let headingDeg = headingRad * 180 / Math.PI;
  headingDeg = (headingDeg + 360) % 360;

  sim.euler.setFromQuaternion(sim.orientation, 'YXZ');

  const altitude = Math.max(0, sim.position.y - aircraft.userData.gearOffset);

  const apActive = autopilot.isActive();
  const apSeq = autopilot.getCurrentSeq();
  const apLen = autopilot.getMissionLength();
  const apPhase = autopilot.getPhase();

  updateHud({
    speed: sim.velocity.length(),
    altitude,
    aoa: sim._aoa || 0,
    vsi: sim.vsi,
    headingDeg,
    throttle01: controls.throttle,
    gForce: sim.gForce,
    pitchRad: sim.euler.x,
    rollRad: sim.euler.z,
    status: sim.status + (controls.paused ? ' · PAUSED' : ''),
    qgcOnline: isBridgeOnline(),
    navDegraded,
    mode: apActive ? `AUTO·${apPhase}` : 'MANUAL',
    missionSeq: apActive ? apSeq : null,
    missionLen: apLen,
    damage: sim.damage,
    recording: isRecording(recorder),
    replaying: isReplaying(recorder),
    hitl: hitlEngaged,
    padConnected: isPadConnected(),
    audioMuted: audio.isStarted() ? !audio.isAudible() : false,
    scenario: (() => {
      const sa = scenario.getActive();
      if (!sa) return null;
      const obj = scenario.getCurrentObjective();
      const courseName = scenario.listCourses().find(c => c.id === sa.courseId)?.name || '';
      let objText;
      if (sa.completed) {
        objText = `COMPLETE · ${sa.totalSeconds.toFixed(1)}s · +${sa.timeBonus} time bonus`;
      } else if (obj) {
        objText = `${sa.idx + 1}. ${obj.name}`;
      } else {
        objText = '—';
      }
      return { title: courseName, objective: objText, score: sa.score };
    })(),
    multiplayer: mp.isActive() ? { peers: mp.getPeerCount() } : null,
  });

  // Send telemetry to MAVLink bridge (no-op when bridge offline). We send the
  // MEASURED (sensor) state, not truth — so GPS jam/bias/freeze and other sensor
  // faults injected via window.injectFault show up live in QGroundControl (M10).
  const truthTelemetry = {
    x: sim.position.x,
    y: sim.position.y,
    z: sim.position.z,
    vx: sim.velocity.x,
    vy: sim.velocity.y,
    vz: sim.velocity.z,
    speed: sim.velocity.length(),
    altitude,
    rollRad: sim.euler.z,
    pitchRad: sim.euler.x,
    yawRad: sim.euler.y,
    headingDeg,
    throttle01: controls.throttle,
    vsi: sim.vsi,
    missionSeq: apActive ? apSeq : -1,
  };
  maybeSend(mergeMeasuredIntoTelemetry(truthTelemetry, measured), performance.now());
}

// Loop is driven by renderer.setAnimationLoop so WebXR sessions tick on the
// XR frame clock when active, and on rAF otherwise.
renderer.setAnimationLoop(loop);


