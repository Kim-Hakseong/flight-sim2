// Keyboard input → control state.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.
//
// W/S = pitch, A/D = roll, Q/E = yaw, ↑/↓ = throttle,
// R = reset, V = camera, P = pause.

export function createControlState() {
  return {
    // Pilot inputs in [-1, +1] (raw key state). Sign convention per CLAUDE.md §3.
    pitch: 0,   // + = nose up   (W)
    roll: 0,    // + = right roll (D)
    yaw: 0,     // + = nose right (E)
    throttle: 0, // [0, 1]
    paused: false,
    onReset: () => {},
    onCameraToggle: () => {},
    onMissionStart: () => {},
    onMissionAbort: () => {},
    onRecToggle: () => {},
    onReplayToggle: () => {},
    onHitlToggle: () => {},
    onCsvExport: () => {},
    onAudioToggle: () => {},
    onVehicleToggle: () => {},
    onScenarioCycle: () => {},
    onScenarioStart: () => {},
    onMultiplayerToggle: () => {},
    onDemoMission: () => {},
  };
}

export function attachKeyboard(state) {
  const keys = new Set();

  function down(e) {
    const k = e.key.toLowerCase();
    if (keys.has(k)) return; // ignore auto-repeat for one-shot keys
    keys.add(k);

    if (k === 'r') state.onReset();
    if (k === 'v') state.onCameraToggle();
    if (k === 'p') state.paused = !state.paused;
    if (k === 'm') state.onMissionStart();
    if (k === 'n') state.onMissionAbort();
    if (k === 'f') state.onRecToggle();
    if (k === 'l') state.onReplayToggle();
    if (k === 'h') state.onHitlToggle();
    if (k === 'y') state.onCsvExport();
    if (k === 'x') state.onAudioToggle();
    if (k === 'z') state.onVehicleToggle();
    if (k === 't') state.onScenarioCycle();
    if (k === 'g') state.onScenarioStart();
    if (k === 'j') state.onMultiplayerToggle();
    if (k === 'k') state.onDemoMission();

    updateAxes(state, keys);
    // Throttle is integrated over time, but we also want a tiny instant nudge.
  }
  function up(e) {
    keys.delete(e.key.toLowerCase());
    updateAxes(state, keys);
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);

  // Throttle integration (held key => ramp up/down).
  state._heldKeys = keys;

  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}

function updateAxes(state, keys) {
  let pitch = 0, roll = 0, yaw = 0;
  if (keys.has('w')) pitch += 1;
  if (keys.has('s')) pitch -= 1;
  if (keys.has('d')) roll += 1;
  if (keys.has('a')) roll -= 1;
  if (keys.has('e')) yaw += 1;
  if (keys.has('q')) yaw -= 1;
  state.pitch = pitch;
  state.roll = roll;
  state.yaw = yaw;
}

const THROTTLE_RATE = 0.4; // per second when held

export function tickThrottle(state, dt) {
  const keys = state._heldKeys;
  if (!keys) return;
  if (keys.has('arrowup'))   state.throttle = Math.min(1, state.throttle + THROTTLE_RATE * dt);
  if (keys.has('arrowdown')) state.throttle = Math.max(0, state.throttle - THROTTLE_RATE * dt);
}
