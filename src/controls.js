// Keyboard input → control state.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.
//
// W/S = pitch, A/D = roll, Q/E = yaw, ↑/↓ = throttle,
// R = reset, V = camera, P = pause.

export function createControlState() {
  return {
    // Pilot inputs in [-1, +1] (shaped command, fed to the actuators). Sign
    // convention per CLAUDE.md §3.
    pitch: 0,   // + = nose up   (W)
    roll: 0,    // + = right roll (D)
    yaw: 0,     // + = nose right (E)
    throttle: 0, // [0, 1]
    paused: false,
    // Keyboard input shaping (M42): the raw key target (±1 bang-bang) and a
    // rate-limited "stick position" that ramps toward it. tickControls() turns
    // this into the shaped command so a tap no longer slams the surface to full.
    _kbTarget: { pitch: 0, roll: 0, yaw: 0 },
    _kbStick:  { pitch: 0, roll: 0, yaw: 0 },
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
  // Set the key TARGET; tickControls() ramps the actual command toward it.
  state._kbTarget.pitch = pitch;
  state._kbTarget.roll = roll;
  state._kbTarget.yaw = yaw;
}

// Keyboard input feel (M42). The raw key axis is bang-bang (±1 the instant a key
// is pressed), which feels twitchy on a real 6-DOF airframe. We model a stick with
// finite travel speed (ramp toward the target) plus an expo curve (a soft centre
// for fine corrections, full authority still available at the stops). Analog
// inputs (gamepad/touch) and the autopilot bypass this entirely — they write the
// command directly and tickControls leaves their axes alone.
export const CONTROL_FEEL = {
  rampUp: 2.4,      // command units/s toward a held key (~0.4 s key→full)
  rampCenter: 5.0,  // command units/s back to centre on release (~0.2 s)
  expo: 0.55,       // 0 = linear, 1 = pure cubic (softer near centre)
};

export function expoShape(x, expo) {
  return (1 - expo) * x + expo * x * x * x;
}

/**
 * Advance the keyboard "stick" toward its key target and write the shaped command
 * onto state.pitch/roll/yaw. Only axes with active keyboard involvement (key held
 * or stick still returning to centre) are written, so analog/AP inputs are not
 * clobbered. Call once per RENDER frame (manual real-time path only) — the
 * deterministic __advance path never calls this, so headless runs stay reproducible.
 */
export function tickControls(state, dt) {
  const t = state._kbTarget, s = state._kbStick;
  for (const axis of ['pitch', 'roll', 'yaw']) {
    const tgt = t[axis];
    const prev = s[axis];
    const rate = (tgt === 0 ? CONTROL_FEEL.rampCenter : CONTROL_FEEL.rampUp) * dt;
    const d = tgt - prev;
    s[axis] += Math.abs(d) <= rate ? d : Math.sign(d) * rate;
    // Write only when the keyboard owns this axis this frame — target held, stick
    // still moving, or it just settled (prev≠0) so we land the final exact 0.
    // Otherwise leave the axis for analog (touch/gamepad) or the autopilot.
    if (tgt !== 0 || s[axis] !== 0 || prev !== 0) {
      state[axis] = expoShape(s[axis], CONTROL_FEEL.expo);
    }
  }
}

const THROTTLE_RATE = 0.4; // per second when held

export function tickThrottle(state, dt) {
  const keys = state._heldKeys;
  if (!keys) return;
  if (keys.has('arrowup'))   state.throttle = Math.min(1, state.throttle + THROTTLE_RATE * dt);
  if (keys.has('arrowdown')) state.throttle = Math.max(0, state.throttle - THROTTLE_RATE * dt);
}
