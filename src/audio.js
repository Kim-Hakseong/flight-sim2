// Procedural audio via Web Audio API. No samples / no external assets — just
// oscillators + filtered noise + buffered impulses.
//
// Browsers refuse to start audio until a user gesture, so we lazy-init the
// AudioContext on first key/click. Until then every `set*` and `play*` call
// is a no-op. Failure modes (no Web Audio in the browser) are silent.
//
// Channels:
//   ENGINE   — two detuned sawtooths through a low-pass; pitch ∝ throttle,
//              gain ∝ throttle, roughens up as engine HP drops.
//   WIND     — looping noise buffer through a low-pass; gain & cutoff ∝ speed
//   STALL    — square-wave 880 Hz pulsed at 4 Hz when stalled
//   IMPACT   — one-shot filtered noise burst
//   EXPLOSION— two layered impacts + a deep boom

let ctx = null;
let started = false;
let enabled = true;          // user can mute via 'S' key
let nodes = {};
let stallPhase = 0;
let masterGain = null;

export function isStarted() { return started && enabled; }
export function isAudible() { return started && enabled; }

/** Toggle audible on/off without tearing down the graph. */
export function toggleEnabled() {
  enabled = !enabled;
  if (masterGain && ctx) {
    masterGain.gain.setTargetAtTime(enabled ? 1.0 : 0.0, ctx.currentTime, 0.05);
  }
  return enabled;
}

/** Lazy boot. Call from any user-gesture handler. */
export function start() {
  if (started) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  try {
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = enabled ? 1.0 : 0.0;
    masterGain.connect(ctx.destination);
    setupEngine();
    setupWind();
    setupStall();
    started = true;
  } catch {
    started = false;
  }
}

// ---------- Engine ----------

function setupEngine() {
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 80;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = 84; // detune for thicker timbre

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc1.start(); osc2.start();

  nodes.engine = { osc1, osc2, filter, gain };
}

/**
 * @param throttle 0..1
 * @param engineHp 0..1 — at low HP we drop volume + add growl by lowering the
 *                 filter cutoff (sounds choked / sputtering).
 */
export function setEngine(throttle, engineHp = 1.0) {
  if (!started) return;
  const t = ctx.currentTime;
  const baseFreq = 60 + throttle * 240;        // 60..300 Hz
  const damageWobble = (1 - engineHp) * (Math.random() * 8);
  nodes.engine.osc1.frequency.setTargetAtTime(baseFreq + damageWobble, t, 0.04);
  nodes.engine.osc2.frequency.setTargetAtTime(baseFreq * 1.05 - damageWobble, t, 0.04);
  const targetGain = throttle * 0.16 * Math.max(0.15, engineHp);
  nodes.engine.gain.gain.setTargetAtTime(targetGain, t, 0.05);
  const cutoff = (300 + throttle * 1400) * Math.max(0.4, engineHp);
  nodes.engine.filter.frequency.setTargetAtTime(cutoff, t, 0.05);
}

// ---------- Wind ----------

function setupWind() {
  const sec = 2;
  const buf = ctx.createBuffer(1, sec * ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start();

  nodes.wind = { noise, filter, gain };
}

export function setWind(speedMs) {
  if (!started) return;
  const t = ctx.currentTime;
  // Roughly: silence below ~10 m/s, peak around 80 m/s.
  const vol = Math.min(0.22, Math.max(0, (speedMs - 10) / 70) ** 1.4 * 0.22);
  nodes.wind.gain.gain.setTargetAtTime(vol, t, 0.15);
  const cutoff = 250 + Math.min(2200, speedMs * 28);
  nodes.wind.filter.frequency.setTargetAtTime(cutoff, t, 0.15);
}

// ---------- Stall warning ----------

function setupStall() {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 880;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain); gain.connect(masterGain);
  osc.start();
  nodes.stall = { osc, gain };
}

export function setStall(active, dt) {
  if (!started) return;
  const t = ctx.currentTime;
  if (active) {
    stallPhase += dt;
    const on = ((stallPhase * 4) % 1) < 0.5;
    nodes.stall.gain.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.005);
  } else {
    stallPhase = 0;
    nodes.stall.gain.gain.setTargetAtTime(0, t, 0.05);
  }
}

// ---------- One-shot impact / explosion ----------

export function playImpact(intensity = 1) {
  if (!started) return;
  const dur = 0.25 + intensity * 0.45;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(dur * ctx.sampleRate)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const time = i / ctx.sampleRate;
    const env = Math.exp(-time * (3.5 / Math.max(0.1, intensity)));
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220 + intensity * 500;
  const gain = ctx.createGain();
  gain.gain.value = 0.45 * Math.min(1.5, intensity);
  src.connect(filter); filter.connect(gain); gain.connect(masterGain);
  src.start();
}

export function playExplosion() {
  if (!started) return;
  playImpact(1.6);
  setTimeout(() => playImpact(1.0), 90);
  setTimeout(() => playImpact(0.5), 220);
}
