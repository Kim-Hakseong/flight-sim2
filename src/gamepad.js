// Gamepad / flight-stick support via the browser Gamepad API.
//
// Mapping (works out-of-the-box for XInput-style pads and most consumer
// flight sticks):
//   axis 0          → roll       (right wing down = +)
//   axis 1 (inverted)→ pitch      (forward stick → nose up)
//   axis 2          → yaw        (twist axis on flight sticks)
//   buttons[6]+[7]  → throttle   (RT - LT*0.5; right trigger = throttle up)
//   axis 3 fallback → throttle   ((1 - axis) / 2; flight-stick slider, neg = max)
//
// The browser exposes `navigator.getGamepads()`; pads are not "events" — you
// must poll. main.js calls `pollGamepad()` once per frame.

const DEFAULT_DEADZONE = 0.08;

/** Rescale a raw axis into [-1, 1] after subtracting the deadzone band. */
export function applyDeadzone(v, dz = DEFAULT_DEADZONE) {
  if (Math.abs(v) < dz) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * (Math.abs(v) - dz) / (1 - dz);
}

/**
 * Pure mapping from a raw `Gamepad` snapshot to control axes.
 * @returns {{roll:number,pitch:number,yaw:number,throttle:number|null}}
 *   Axis values are in [-1, 1]; throttle is 0..1 or `null` when neither
 *   triggers nor a recognized slider report any input (so keyboard ↑/↓
 *   continues to work).
 */
export function mapAxes(pad, deadzone = DEFAULT_DEADZONE) {
  const a = pad.axes || [];
  const b = pad.buttons || [];

  const roll  = applyDeadzone(a[0] ?? 0, deadzone);
  const pitch = applyDeadzone(-(a[1] ?? 0), deadzone);
  const yaw   = applyDeadzone(a[2] ?? 0, deadzone);

  let throttle = null;
  // Triggers (XInput layout): buttons[6] = LT, [7] = RT, .value is 0..1.
  if (b.length > 7) {
    const lt = b[6]?.value ?? 0;
    const rt = b[7]?.value ?? 0;
    if (rt > 0.02 || lt > 0.02) {
      throttle = Math.max(0, Math.min(1, rt - lt * 0.5));
    }
  }
  // Flight-stick throttle slider on axis 3 (neg = max, pos = min).
  if (throttle === null && a.length > 3) {
    const a3 = a[3] ?? 0;
    if (Math.abs(a3) > 0.02) {
      throttle = Math.max(0, Math.min(1, (1 - a3) / 2));
    }
  }

  return { roll, pitch, yaw, throttle };
}

// ---------- Browser-side polling state ----------

let lastConnectedId = null;

/** Poll the connected gamepad. Returns null if no pad is plugged in. */
export function pollGamepad(deadzone = DEFAULT_DEADZONE) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const p of pads) {
    if (!p || !p.connected) continue;
    if (p.id !== lastConnectedId) {
      lastConnectedId = p.id;
      // eslint-disable-next-line no-console
      console.log(`[gamepad] connected: ${p.id} (${p.axes.length} axes, ${p.buttons.length} buttons)`);
    }
    const m = mapAxes(p, deadzone);
    return { ...m, padId: p.id };
  }
  if (lastConnectedId) {
    // eslint-disable-next-line no-console
    console.log('[gamepad] disconnected');
    lastConnectedId = null;
  }
  return null;
}

export function isConnected() { return lastConnectedId !== null; }
