// Bootstrap + main loop. Owns the simulation state and ticks every subsystem.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.

import { buildWorld, RUNWAY_START_Z, MAPS, DEFAULT_MAP, CONDITIONS, DEFAULT_CONDITION } from './world.js';
import { buildAircraft, AIRCRAFT_MODELS, DEFAULT_MODEL } from './aircraft.js';
import { initModelPicker, initIntro, initTouchControls, isTouchDevice } from './ui.js';
import { createCameraRig, nextMode, updateCamera } from './camera.js';
import { createControlState, attachKeyboard, tickThrottle, tickControls, CONTROL_FEEL } from './controls.js';
import { initHud, updateHud, setHudEngMode } from './hud.js';
import { initEngineering } from './engineering.js';
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
  highLift,
  INERTIA,
  GRAVITY,
  STALL_AOA_RAD,
} from './physics.js';
import { DT_PHYS, MAX_SUBSTEPS, planSteps, rk4Step } from './fixedStep.js';
import { stepActuator } from './actuators.js';
import { makeRng, stepSensor } from './sensors.js';
import { createKF, kfStepGated } from './estimator.js';
import { buildDemoMission } from './missions.js';
import { windStep, shearFactor } from './wind.js';

const THREE = window.THREE;

// ---------- Renderer / scene / camera ----------

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
// Filmic colour pipeline (M27): ACES tonemapping + sRGB output gives the
// cinematic, "Unreal-grade" look instead of flat washed colours. Lights below
// are re-balanced for this. Exposure trims overall brightness.
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
// Shadows (M30): soft shadow maps. The sun's shadow frustum is tight and follows
// the aircraft (set each frame) so shadows are crisp where they matter despite the
// huge world.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
// Single static world build (GCS lean build): one map ('plains') and one
// condition ('day'). The runway/ground/obstacles are identical to the original.
const currentMap = DEFAULT_MAP;
const world = buildWorld(scene, colliders, currentMap);
const sunLight = world.sun;
let mapWater = world.water;     // animated ocean mesh (null on the plains map)
let mapSky = world.skyMat;      // sky shader material
const currentCond = DEFAULT_CONDITION;

// Apply the (single) lighting condition on top of the active map. Sets
// the sun (direction = time of day), hemisphere/ambient light, fog, sky tint,
// exposure, ocean tint and cloud look. Unspecified fields fall back to the map.
const _ld = new THREE.Vector3();
function tintColor(hex, scale, tintHex, amt) {
  const c = new THREE.Color(hex).multiplyScalar(scale == null ? 1 : scale);
  if (tintHex != null) c.lerp(new THREE.Color(tintHex), amt || 0);
  return c;
}
function applyLighting(mapCfg, condKey) {
  const cond = CONDITIONS[condKey] || CONDITIONS[DEFAULT_CONDITION];
  const dir = _ld.set(...(cond.sunDir || [0.55, 0.7, -0.35])).normalize();
  if (sunLight.userData.dir) sunLight.userData.dir.copy(dir); else sunLight.userData.dir = dir.clone();
  sunLight.color.set(cond.sunColor ?? mapCfg.sky.sun);
  sunLight.intensity = cond.sunInt ?? 1.05;
  world.hemi.color.set(cond.hemiSky ?? mapCfg.hemi.sky);
  world.hemi.groundColor.set(cond.hemiGround ?? mapCfg.hemi.ground);
  world.hemi.intensity = cond.hemiInt ?? mapCfg.hemi.intensity;
  world.fill.color.set(cond.fillColor ?? 0x223344);
  world.fill.intensity = cond.fillInt ?? 0.25;
  renderer.toneMappingExposure = cond.exposure ?? 1.15;

  const hz = tintColor(mapCfg.sky.horizon, cond.skyScale, cond.skyTint, cond.skyTintAmt);
  const zn = tintColor(mapCfg.sky.zenith, cond.skyScale, cond.skyTint, cond.skyTintAmt);
  const gd = tintColor(mapCfg.sky.ground, cond.skyScale, cond.skyTint, cond.skyTintAmt);
  if (mapSky) {
    mapSky.uniforms.horizonColor.value.copy(hz);
    mapSky.uniforms.zenithColor.value.copy(zn);
    mapSky.uniforms.groundColor.value.copy(gd);
    mapSky.uniforms.sunDirection.value.copy(dir);
    mapSky.uniforms.sunColor.value.set(cond.sunColor ?? mapCfg.sky.sun);
  }
  if (scene.fog) {
    scene.fog.color.copy(hz);                       // fog matches the horizon
    scene.fog.near = mapCfg.fog.near * (cond.fogScale ?? 1);
    scene.fog.far = mapCfg.fog.far * (cond.fogScale ?? 1);
  }
  if (mapWater) {
    mapWater.material.uniforms.uSky.value.copy(hz);
    mapWater.material.uniforms.uSun.value.set(cond.sunColor ?? mapCfg.sky.sun);
    mapWater.material.uniforms.uSunDir.value.copy(dir);
    mapWater.material.uniforms.uDeep.value.multiplyScalar(1); // (kept; deep stays biome)
  }
  // Reflections (IBL) re-tinted to the final sky.
  regenEnv({ sky: zn.getHex(), horizon: hz.getHex(), ground: gd.getHex() });
}

// Image-based lighting (M27): prefilter a sky/ground gradient into an environment
// map so the PBR materials (jet metal, canopy glass) pick up real reflections.
// Re-runnable so a map swap (M35) re-tints the reflections to the new biome.
function regenEnv(ec) {
  try {
    if (scene.environment) { scene.environment.dispose(); scene.environment = null; }
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16);
    const cols = new Float32Array(geo.attributes.position.count * 3);
    const sky = new THREE.Color(ec.sky), horiz = new THREE.Color(ec.horizon), grnd = new THREE.Color(ec.ground);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const ny = geo.attributes.position.getY(i) / 50; // -1..1
      const c = ny > 0 ? horiz.clone().lerp(sky, Math.min(1, ny * 1.4))
                       : horiz.clone().lerp(grnd, Math.min(1, -ny * 1.6));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const envMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    envScene.add(envMesh);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    geo.dispose(); envMesh.material.dispose(); pmrem.dispose();
  } catch (e) {
    console.warn('[env] PMREM environment unavailable:', e && e.message);
  }
}
// Initial lighting from the active map + condition (also generates the env map).
applyLighting(MAPS[currentMap], currentCond);

const effects = createEffects(scene);

const camera = new THREE.PerspectiveCamera(
  65, window.innerWidth / window.innerHeight, 0.1, 20000,
);

// Post-processing composer (M27): UnrealBloom adds the glow that sells the
// "Unreal-grade" look — afterburner, sun glare, nav lights, bright HUD. Falls
// back to a plain render if the example scripts didn't load (offline/headless).
let composer = null, bloomPass = null;
(function setupComposer() {
  if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) {
    console.warn('[gfx] post-processing unavailable — using direct render');
    return;
  }
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35,  // strength — subtle
      0.4,   // radius
      0.92,  // threshold — only the SUN / afterburner / nav lights bloom, not the
             // bright scene (otherwise the whole frame hazes over)
    );
    composer.addPass(bloomPass);
    // The composer's render targets are LINEAR, so render the scene linear (tone-
    // mapping is still applied in the materials) and convert to sRGB in a final
    // gamma pass. Without this the whole frame washes out (double/!sRGB encoding).
    renderer.outputEncoding = THREE.LinearEncoding;
    if (THREE.GammaCorrectionShader) {
      composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    }
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  } catch (e) {
    console.warn('[gfx] composer setup failed:', e && e.message);
    composer = null;
  }
})();

// Re-centre the sun's tight shadow frustum on the aircraft so shadows stay crisp.
const _sunFollow = new THREE.Vector3();
function updateSunShadow() {
  if (!sunLight || !sunLight.userData.dir) return;
  const p = getActiveVehicleMesh().position;
  sunLight.target.position.set(p.x, 0, p.z);
  _sunFollow.copy(sunLight.userData.dir).multiplyScalar(500);
  sunLight.position.set(p.x + _sunFollow.x, _sunFollow.y, p.z + _sunFollow.z);
  sunLight.target.updateMatrixWorld();
}

// Single render entry — composer when available, else direct.
function renderScene() {
  updateSunShadow();
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Aircraft + sim state ----------

let aircraft = buildAircraft(DEFAULT_MODEL);
let aircraftModel = DEFAULT_MODEL;
enableShadows(aircraft);
scene.add(aircraft);

// ---------- Engineering / HILS bench view (M45) ----------
// A reversible "engineering" layer: a CAD/ground-station look (reference grid +
// world/body axis triads, flat tonemapping, no bloom glow) plus the data console.
// Toggle with 'B' or window.__engView(); persisted. Default ON — the sim presents
// as a flight-test bench, not a game; switch off for the cinematic look.
const refGrid = new THREE.GridHelper(16000, 80, 0x2c4250, 0x1c2c36);
refGrid.position.y = 0.05; scene.add(refGrid);
const worldAxes = new THREE.AxesHelper(60); worldAxes.position.y = 0.1; scene.add(worldAxes);
const bodyAxes = new THREE.AxesHelper(9); scene.add(bodyAxes);   // synced to the aircraft each frame

const eng = (typeof document !== 'undefined') ? initEngineering({
  injectFault: (target, spec) => { hilsFaults[target] = spec || null; },
  clearFaults: () => { for (const k of Object.keys(hilsFaults)) delete hilsFaults[k]; },
  getFaults: () => hilsFaults,
}) : null;

let engView = true;
function applyEngView(on) {
  engView = !!on;
  if (bloomPass) bloomPass.strength = on ? 0.0 : 0.35;
  renderer.toneMapping = on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = on ? 1.0 : 1.15;
  // toneMapping is a shader #define → recompile materials so the change takes hold.
  scene.traverse((o) => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
  });
  refGrid.visible = on; worldAxes.visible = on; bodyAxes.visible = on;
  if (eng) eng.setVisible(on);
  setHudEngMode(on);
  if (typeof document !== 'undefined') document.body.classList.toggle('eng-mode', on);
  try { localStorage.setItem('fs-engview', on ? '1' : '0'); } catch { /* private mode */ }
}
if (typeof window !== 'undefined') {
  window.__engView = (on) => { if (on != null) applyEngView(on); return engView; };
  let saved = '1';
  try { saved = localStorage.getItem('fs-engview') ?? '1'; } catch { /* */ }
  applyEngView(saved !== '0');
  window.addEventListener('keydown', (e) => {
    if (e.key && e.key.toLowerCase() === 'b' && !e.repeat) applyEngView(!engView);
  });
}

// Swap the aircraft 3D model at runtime (model picker / window.setAircraftModel).
// Disposes the old meshes, rebuilds, re-adds, and resets to the runway so the new
// jet starts cleanly. The sim physics are model-agnostic (mass/aero unchanged here).
function disposeObject(obj) {
  obj.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
  });
}
// Mark every mesh of the aircraft as a shadow caster + receiver (self-shadowing).
function enableShadows(obj) {
  obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
}
function setAircraftModel(key) {
  if (!AIRCRAFT_MODELS[key] || key === aircraftModel) return false;
  scene.remove(aircraft);
  disposeObject(aircraft);
  aircraft = buildAircraft(key);
  aircraftModel = key;
  enableShadows(aircraft);
  scene.add(aircraft);
  if (typeof resetAircraft === 'function') resetAircraft();
  console.log(`[aircraft] model → ${key} (${AIRCRAFT_MODELS[key].label})`);
  return true;
}
let modelPicker = null;

// Control sensitivity presets (M44) — three coarse, mouse-DPI-style buckets that
// map to the keyboard input-shaping feel (M42). "soft" = slow stick + strong expo
// (forgiving); "sharp" = fast stick + light expo (responsive). Persisted under
// SENS_KEY and re-applied on load.
const SENS_PRESETS = {
  soft:  { label: '부드러움', sub: '입문 · 둔감',  rampUp: 1.5, rampCenter: 4.0, expo: 0.78 },
  std:   { label: '표준',     sub: '권장',          rampUp: 2.4, rampCenter: 5.0, expo: 0.55 },
  sharp: { label: '예민',     sub: '빠른 반응',     rampUp: 4.2, rampCenter: 6.5, expo: 0.30 },
};
const SENS_LEVELS = Object.entries(SENS_PRESETS).map(([key, v]) => ({ key, label: v.label, sub: v.sub }));
const DEFAULT_SENS = 'std';
const SENS_KEY = 'fs-sensitivity';
let sensLevel = DEFAULT_SENS;
function applySensitivity(level) {
  const pr = SENS_PRESETS[level] || SENS_PRESETS[DEFAULT_SENS];
  sensLevel = SENS_PRESETS[level] ? level : DEFAULT_SENS;
  Object.assign(CONTROL_FEEL, { rampUp: pr.rampUp, rampCenter: pr.rampCenter, expo: pr.expo });
  try { localStorage.setItem(SENS_KEY, sensLevel); } catch { /* private mode */ }
  return sensLevel;
}

if (typeof window !== 'undefined') {
  window.setAircraftModel = (key) => { const ok = setAircraftModel(key); if (ok && modelPicker) modelPicker.refresh(); return ok; };
  window.listAircraftModels = () => Object.entries(AIRCRAFT_MODELS)
    .map(([k, v]) => ({ key: k, label: v.label, role: v.role, jet: v.jet }));
  window.__aircraftModel = () => aircraftModel;
  // Keyboard control feel (M42): tune sensitivity live. Lower rampUp / higher expo
  // = gentler. e.g. window.__ctrlFeel({ rampUp: 1.8, expo: 0.7 }). No args → read.
  window.__ctrlFeel = (opts) => { if (opts) Object.assign(CONTROL_FEEL, opts); return { ...CONTROL_FEEL }; };
  // Control sensitivity presets (M44): three coarse buckets, mouse-DPI style. The
  // chosen level is persisted and re-applied on load; the intro modal exposes the
  // three buttons and window.__sensitivity reads/sets it programmatically.
  window.__sensitivity = (lvl) => { if (lvl) applySensitivity(lvl); return sensLevel; };
  try { applySensitivity(localStorage.getItem(SENS_KEY) || DEFAULT_SENS); } catch { applySensitivity(DEFAULT_SENS); }
  window.__map = () => currentMap;
  window.__cond = () => currentCond;
  // Build the on-screen UI once the DOM is ready: model picker, touch controls
  // (mobile), and the intro/controls popup.
  const buildUI = () => {
    modelPicker = initModelPicker(
      window.listAircraftModels(),
      () => aircraftModel,
      (key) => window.setAircraftModel(key),
    );
    const params = new URLSearchParams(location.search);
    // Touch controls are always created (so the 🕹 toggle works on any device); they
    // start VISIBLE on touch devices or with ?touch=1, hidden otherwise.
    const touchParam = params.get('touch');
    const startVisible = touchParam === '1' || (touchParam !== '0' && isTouchDevice);
    // Hide the keyboard help text whenever the on-screen controls are showing.
    const syncHelp = (v) => { const h = document.getElementById('hud-help'); if (h) h.style.display = v ? 'none' : ''; };
    const touchUI = initTouchControls(controls, {
      onCamera: () => controls.onCameraToggle(),
      onPause: () => { controls.paused = !controls.paused; },
      onDemo: () => window.loadDemoMission(),
      onReset: () => controls.onReset(),
      onToggle: syncHelp,
    }, startVisible);
    window.__toggleTouch = (v) => touchUI.setVisible(v == null ? !touchUI.isVisible() : v);
    // Intro popup on entry (skip with ?intro=0 for screenshots/tests).
    if (params.get('intro') !== '0') {
      window.__intro = initIntro({
        touch: isTouchDevice,
        onDemo: () => window.loadDemoMission(),
        onManual: () => {},
        sensitivity: {
          levels: SENS_LEVELS,
          get: () => sensLevel,
          set: (k) => applySensitivity(k),
        },
      });
    }
  };
  // Defer so the rest of the module (incl. `controls`) finishes initializing first.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else queueMicrotask(buildUI);
}

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
  altitude: { noise: 0.5, bandwidth: 14 },   // m    (baro, low lag for the approach)
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
let simTime = 0;                            // mission-elapsed clock (engineering bench)
let armed = true;                           // GCS arm state (disarm = engine cut). M2.

// Atmospheric wind (M22): aerodynamics use (velocity − wind). Default calm.
//   setWind(eastMps, northMps, gustMps)  e.g. setWind(8, 0, 4) = 8 m/s crosswind + gusts
let windSteady = { x: 0, y: 0, z: 0 };     // world: +x east, −z north
let windGust = { x: 0, y: 0, z: 0 };
let windIntensity = 0;                      // gust RMS (m/s)
const WIND_SEED = 0x5EED;
let windRng = makeRng(WIND_SEED);
const currentWind = new THREE.Vector3();    // total wind this frame

if (typeof window !== 'undefined') {
  window.injectFault = (target, fault) => { hilsFaults[target] = fault || null; };
  window.clearFaults = () => { for (const k of Object.keys(hilsFaults)) delete hilsFaults[k]; };
  window.setNavSource = (s) => { if (['truth', 'measured', 'estimated'].includes(s)) navSource = s; };
  // Wind: east (m/s, +=from west), north (m/s, +=from south), gust RMS (m/s).
  // Reseed the gust RNG so the gust sequence is reproducible from each call (the
  // deterministic test relies on this).
  window.setWind = (east = 0, north = 0, gust = 0) => {
    windSteady = { x: east, y: 0, z: -north }; windIntensity = Math.max(0, gust);
    windGust = { x: 0, y: 0, z: 0 }; windRng = makeRng(WIND_SEED);
  };
  window.__wind = { get vector() { return { x: currentWind.x, y: currentWind.y, z: currentWind.z }; }, get intensity() { return windIntensity; } };
  window.__hils = {
    get measured() { return measured; },
    get actuators() { return sim.actuators; },
    get faults() { return hilsFaults; },
    get navSource() { return navSource; },
    get nav() { return navEstimate; },
    get navDegraded() { return navDegraded; },
    get pos() { return { x: sim.position.x, y: sim.position.y, z: sim.position.z }; },
    get vel() { return { x: sim.velocity.x, y: sim.velocity.y, z: sim.velocity.z, spd: sim.velocity.length() }; },
    get status() { return sim.status; },
    get wind() { return { x: currentWind.x, y: currentWind.y, z: currentWind.z }; },
    get diag() {
      const f = tmpForward.set(0, 0, -1).applyQuaternion(sim.orientation);
      const u = tmpUp.set(0, 1, 0).applyQuaternion(sim.orientation);
      const r = tmpRight.set(1, 0, 0).applyQuaternion(sim.orientation);
      const air = _airVel.copy(sim.velocity).sub(currentWind);
      const D = 180 / Math.PI;
      return {
        airspd: +air.length().toFixed(1),
        aoa: +(angleOfAttack(air, f, r === r ? u : u) * D).toFixed(1),
        pitch: +(Math.asin(Math.max(-1, Math.min(1, f.y))) * D).toFixed(1),
        bank: +(-Math.asin(Math.max(-1, Math.min(1, r.y))) * D).toFixed(1),
        hdg: +(((Math.atan2(f.x, -f.z) * D) % 360 + 360) % 360).toFixed(1),
        beta: +(sideslipAngle(air, f, r) * D).toFixed(1),
        ail: +sim.actuators.aileron.toFixed(2),
        rud: +sim.actuators.rudder.toFixed(2),
        rollrate: +(-sim.omega.z * D).toFixed(1),
        yawrate: +(sim.omega.y * D).toFixed(1),
        thr: +controls.throttle.toFixed(2),
        flaps: +(sim.flaps || 0).toFixed(1),
      };
    },
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

  // High-lift devices (0..1), commanded by the autopilot on approach/rollout.
  flaps: 0,
  spoilers: 0,

  status: 'OK', // OK | STALL | CRASH
  vsi: 0,
  gForce: 1.0,

  damage: createDamageState(),

  // For roll/pitch readout from quaternion.
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
};

// Approximate aircraft bounding sphere radius for obstacle collision.
const AIRCRAFT_RADIUS = 5.5;

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
if (typeof window !== 'undefined') {
  window.__camMode = (m) => { if (m) camRig.mode = m; return camRig.mode; };
  window.__aircraftMesh = () => aircraft;
}

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
// GCS arm/disarm (M2): the bridge broadcasts `mode { armed, auto }` on a SET_MODE
// or ARM_DISARM command. Apply the arm bit to the sim; the engine cut takes effect
// in stepSimAndControl and is reflected back to the GCS via telemetry.
{
  const es = getEventSource();
  if (es) es.addEventListener('mode', (e) => {
    try { const d = JSON.parse(e.data); if (typeof d.armed === 'boolean') armed = d.armed; } catch { /* ignore */ }
  });
}
if (typeof window !== 'undefined') window.__arm = (v) => { if (v != null) armed = !!v; return armed; };

function resetAircraft() {
  sim.position.set(0, aircraft.userData.gearOffset, RUNWAY_START_Z);
  sim.velocity.set(0, 0, 0);
  sim.orientation.identity();
  sim.omega.set(0, 0, 0);
  sim.actuators.elevator = sim.actuators.aileron = sim.actuators.rudder = 0;
  sim.flaps = 0; sim.spoilers = 0;
  kfX = createKF(sim.position.x); kfZ = createKF(sim.position.z); kfY = createKF(0);
  navEstimate = null; measured = {}; navDegraded = false; navDegradedHold = 0; gpsRejectStreak = 0;
  simTime = 0;
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
  aircraft.position.copy(sim.position);
  aircraft.quaternion.copy(sim.orientation);
  if (bodyAxes && bodyAxes.visible) { bodyAxes.position.copy(sim.position); bodyAxes.quaternion.copy(sim.orientation); }
}

function getActiveVehicleMesh() {
  return aircraft;
}

resetAircraft();

// ---------- Loop ----------

const tmpForward = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();
const tmpAccel = new THREE.Vector3();
const _airVel = new THREE.Vector3();   // air-relative velocity (velocity − wind)
let prevAccelMag = GRAVITY;

let last = performance.now();
let physAccum = 0; // unsimulated time carried between frames (fixed-step accumulator)
let manualStep = false; // when true, the RAF loop stops stepping physics — a headless
                        // test drives the sim deterministically via window.__advance

// One deterministic simulation step: sense → estimate → autopilot → wind → fixed
// physics sub-steps. Factored out of loop() so a headless test can drive it with a
// constant dt (window.__advance) for a fully reproducible, render-free run — the
// browser's variable RAF dt otherwise makes each flight diverge (M22).
function stepSimAndControl(dt) {
  // Sense → estimate → control (M11). Update the sensor model and the nav
  // estimate first, so the autopilot flies on the selected navSource.
  updateSensors(dt);
  updateNavEstimate(dt);

  // Truth attitude is computed directly from the orientation so the bank/pitch
  // sign convention is unambiguous:
  //   bank > 0 when the right wing is down; pitch > 0 when the nose is up.
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
    // AIR-relative sideslip (velocity − wind): in a crosswind the ground-relative
    // slip includes the standing crab, so coordinating on it would fight the crab.
    // The aerodynamics see this air-relative slip, so the yaw damper must too.
    beta: sideslipAngle(_airVel.copy(sim.velocity).sub(currentWind), fwdAP, rightAP),
    groundOffset: aircraft.userData.gearOffset,   // gear height (varies by model)
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
    sim.flaps = apOut.flaps || 0;
    sim.spoilers = apOut.spoilers || 0;
  }

  // Armed gate (M2): a GCS DISARM cuts the engine — throttle to idle regardless of
  // pilot / autopilot / GCS command. The airframe still flies (glides) on its energy.
  if (!armed) controls.throttle = 0;

  // Wind (M22): evolve the gust once per frame; stepPhysics reads currentWind.
  // A boundary-layer shear scales the wind to ≈0 on the runway (so the ground
  // roll is undisturbed — we model no tyre cornering force) and full strength
  // aloft, so the approach flies a real crosswind that eases toward touchdown.
  const ws = windStep(windSteady, windGust, dt, windRng, windIntensity);
  windGust = ws.gust;
  const shear = shearFactor(sim.position.y - aircraft.userData.gearOffset);
  currentWind.set(ws.wind.x * shear, ws.wind.y * shear, ws.wind.z * shear);

  // Deterministic fixed-step integration (M7): advance physics in fixed DT_PHYS
  // increments regardless of render frame rate, so (state + inputs) → identical
  // trajectory. Controls sampled above are zero-order-held across the sub-steps.
  physAccum += dt;
  const plan = planSteps(physAccum, DT_PHYS, MAX_SUBSTEPS);
  physAccum = plan.remainder;
  if (plan.dropped > 0.25) {
    console.warn(`[fixedStep] shed ${plan.dropped.toFixed(2)}s of sim time (frame hitch)`);
  }
  for (let i = 0; i < plan.steps; i++) {
    stepPhysics(DT_PHYS);
  }
}

// Headless deterministic driver: advance `seconds` of sim time at a constant
// frame dt with no rendering. Reproducible across runs (unlike the RAF loop), so
// autopilot/wind behaviour can be unit-verified. Returns a small status summary.
if (typeof window !== 'undefined') {
  // Freeze the RAF loop and reset to a known initial state so a deterministic test
  // run starts from identical conditions every time. Call before setWind/loadDemoMission.
  window.__resetForTest = () => {
    manualStep = true;
    physAccum = 0;
    windGust = { x: 0, y: 0, z: 0 };
    windRng = makeRng(WIND_SEED);
    resetAircraft();
    return { ok: true };
  };
  window.__advance = (seconds, dtFrame = 1 / 60) => {
    manualStep = true;          // ensure the RAF loop never double-steps the sim
    const n = Math.max(0, Math.round(seconds / dtFrame));
    let done = 0;
    for (let i = 0; i < n; i++) {
      if (sim.status === 'CRASH') break;
      stepSimAndControl(dtFrame);
      done++;
    }
    syncMesh();
    return { simTime: done * dtFrame, status: sim.status };
  };
}

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
    renderScene();

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
    renderScene();

    return;
  }

  if (!controls.paused && sim.status !== 'CRASH' && !manualStep) {
    tickThrottle(controls, dt);
    // Shape keyboard input (M42): ramp the stick toward the key target + expo, so
    // manual flight isn't bang-bang. Runs only on the real-time path; the autopilot
    // (inside stepSimAndControl) overrides these axes when engaged.
    tickControls(controls, dt);

    // Gamepad: per-axis override (only the axes the user is actually pushing,
    // so keyboard remains usable for centered axes / triggers).
    const pad = pollGamepad();
    if (pad) {
      if (Math.abs(pad.roll)  > 0.05) controls.roll  = pad.roll;
      if (Math.abs(pad.pitch) > 0.05) controls.pitch = pad.pitch;
      if (Math.abs(pad.yaw)   > 0.05) controls.yaw   = pad.yaw;
      if (pad.throttle !== null)      controls.throttle = pad.throttle;
    }

    // Sense → estimate → autopilot → wind → deterministic fixed-step physics.
    // Factored into stepSimAndControl so the headless test can drive it directly.
    stepSimAndControl(dt);
  }

  if (mapWater) mapWater.material.uniforms.uTime.value += dt;

  // Spin propeller proportional to throttle. When the engine is destroyed,
  // it stops dead; when damaged it sputters.
  if (aircraft.userData.prop) {
    const eng = sim.damage.engine;
    aircraft.userData.prop.rotation.z += dt * (eng <= 0.05 ? 0 : (10 + controls.throttle * 60) * eng);
  }
  // Jet afterburner: the exhaust cone(s) glow with throttle (visible above ~70%).
  if (!aircraft.userData.prop) {
    const ab = aircraft.userData.afterburners || (aircraft.userData.afterburner ? [aircraft.userData.afterburner] : []);
    const glow = sim.damage.engine > 0.05 ? Math.max(0, (controls.throttle - 0.55) / 0.45) : 0;
    const flicker = 0.85 + 0.15 * Math.sin(strobeT * 40);
    for (const cone of ab) {
      cone.material.opacity = glow * 0.75 * flicker;
      cone.scale.setScalar(0.7 + glow * 0.6);
    }
  }

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

  renderScene();
  
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
  simTime += dt;   // mission-elapsed clock for the engineering bench (M45)
  // --- 1. Aerodynamic state from the current orientation ---
  // (body axes BEFORE this step's rotation; forces below recompute them after.)
  tmpForward.set(0, 0, -1).applyQuaternion(sim.orientation);
  tmpUp.set(0, 1, 0).applyQuaternion(sim.orientation);
  tmpRight.set(1, 0, 0).applyQuaternion(sim.orientation);

  const rhoNow = airDensity(Math.max(0, sim.position.y));
  // Air-relative velocity (M22): aerodynamics see velocity − wind, not ground speed.
  _airVel.copy(sim.velocity).sub(currentWind);
  const vRel = _airVel.length();
  let aoaNow = 0, betaNow = 0;
  if (vRel > 0.5) {
    aoaNow = angleOfAttack(_airVel, tmpForward, tmpUp);
    betaNow = sideslipAngle(_airVel, tmpForward, tmpRight);
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

  // --- 4. Aerodynamic forces (air-relative: velocity − wind) ---
  const altitude = Math.max(0, sim.position.y);
  const rho = airDensity(altitude);
  _airVel.copy(sim.velocity).sub(currentWind);
  const v = _airVel.length();

  let aoa = 0;
  if (v > 0.5) {
    aoa = angleOfAttack(_airVel, tmpForward, tmpUp);
  }
  // Base aero, then apply high-lift devices (flaps add lift+drag, spoilers add
  // drag + dump lift) so the autopilot can fly a slow, gentle approach + brake.
  const { cl, cd } = highLift(liftCoefficient(aoa), dragCoefficient(liftCoefficient(aoa)), sim.flaps, sim.spoilers);
  // Wing damage reduces total lift; if the two wings are unequal, the
  // imbalance produces a roll moment toward the weaker side.
  const lMul = liftMultiplier(sim.damage, 'left');
  const rMul = liftMultiplier(sim.damage, 'right');
  const totalWingMul = (lMul + rMul) * 0.5;
  const Lmag = liftForce({ rho, v, area: AIRCRAFT.wingArea, cl }) * totalWingMul;
  const Dmag = dragForce({ rho, v, area: AIRCRAFT.wingArea, cd });

  // Lift acts perpendicular to the air-relative velocity, in the body-up plane.
  const liftDir = tmpVec.copy(tmpUp);
  if (v > 0.5) {
    const vHat = _airVel.clone().multiplyScalar(1 / v);
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

  // Drag acts opposite the air-relative velocity.
  const dragVec = new THREE.Vector3();
  if (v > 0.001) {
    dragVec.copy(_airVel).multiplyScalar(-Dmag / v);
  }

  // Thrust acts along nose forward (-Z body) in world frame.
  const thrust = AIRCRAFT.maxThrust * controls.throttle * thrustMultiplier(sim.damage);
  const thrustVec = tmpForward.clone().multiplyScalar(thrust);

  // Gravity (world).
  const gravityVec = new THREE.Vector3(0, -AIRCRAFT.mass * GRAVITY, 0);

  // Lateral side force from sideslip (completes 6-DOF translation): acts along
  // the body right axis, opposing the slip so turns become coordinated.
  const betaF = (v > 0.5) ? sideslipAngle(_airVel, tmpForward, tmpRight) : 0;
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
  const sy = kfStepGated(kfY, m.altitude, dt, { q: 8, r: 0.6, gate: 25 });

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

  const _hudRight = tmpRight.set(1, 0, 0).applyQuaternion(sim.orientation);
  updateHud({
    speed: sim.velocity.length(),
    altitude,
    aoa: sim._aoa || 0,
    sideslip: sim.velocity.length() > 1 ? sideslipAngle(sim.velocity, fwd, _hudRight) : 0,
    vsi: sim.vsi,
    headingDeg,
    throttle01: controls.throttle,
    gForce: sim.gForce,
    pitchRad: sim.euler.x,
    rollRad: sim.euler.z,
    status: sim.status + (controls.paused ? ' · PAUSED' : ''),
    qgcOnline: isBridgeOnline(),
    navDegraded,
    mode: !armed ? 'DISARMED' : (apActive ? `AUTO·${apPhase}` : 'MANUAL'),
    missionSeq: apActive ? apSeq : null,
    missionLen: apLen,
    damage: sim.damage,
    recording: isRecording(recorder),
    replaying: isReplaying(recorder),
    hitl: hitlEngaged,
    padConnected: isPadConnected(),
    audioMuted: audio.isStarted() ? !audio.isAudible() : false,
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
    // The sim is authoritative for mode/arm — the bridge maps these into the
    // HEARTBEAT so the GCS shows the vehicle's TRUE state (M2).
    mode: apActive ? 'AUTO' : 'MANUAL',
    armed,
  };
  maybeSend(mergeMeasuredIntoTelemetry(truthTelemetry, measured), performance.now());

  // Engineering bench console (M45): push the live 6-DOF state, surfaces, nav and
  // fault state. Skipped entirely when the console is hidden (cinematic view).
  if (eng && eng.isVisible()) {
    const R2D = 180 / Math.PI;
    const vRel = _airVel.copy(sim.velocity).sub(currentWind);
    const vRelLen = vRel.length();
    const qbar = 0.5 * airDensity(Math.max(0, altitude)) * vRelLen * vRelLen;
    const betaRad = sim.velocity.length() > 1 ? sideslipAngle(sim.velocity, fwd, _hudRight) : 0;
    const gpsErr = (measured && measured.gpsX !== undefined)
      ? Math.hypot(measured.gpsX - sim.position.x, measured.gpsZ - sim.position.z) : null;
    const nis = kfX ? Math.max(kfX.nis || 0, kfZ.nis || 0) : null;
    eng.update({
      t: simTime,
      pos: sim.position, vel: sim.velocity, alt: altitude, spd: sim.velocity.length(),
      roll: sim.euler.z * R2D, pitch: sim.euler.x * R2D, yaw: headingDeg,
      p: -sim.omega.z * R2D, q: sim.omega.x * R2D, r: sim.omega.y * R2D,
      aoa: (sim._aoa || 0) * R2D, beta: betaRad * R2D,
      qbar, g: sim.gForce, vsi: sim.vsi, mach: vRelLen / 340.3,
      act: {
        elevator: sim.actuators.elevator, aileron: sim.actuators.aileron, rudder: sim.actuators.rudder,
        throttle: controls.throttle, flaps: sim.flaps || 0,
      },
      navSource, nis, gpsErr, navDegraded, faults: hilsFaults,
    });
  }
}

// Loop is driven by renderer.setAnimationLoop so WebXR sessions tick on the
// XR frame clock when active, and on rAF otherwise.
renderer.setAnimationLoop(loop);


