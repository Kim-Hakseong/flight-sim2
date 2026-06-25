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

// Jet/turbofan-style, three layered voices so it reads as a real powerplant — NOT
// a beating pair of near-unison oscillators (the old version detuned 80/84 Hz, which
// at idle beat at a few Hz and sounded like a chopping helicopter):
//   core  — a low body tone (rises with RPM)
//   whine — a turbine whine (the "jet" character; rises steeply with RPM)
//   roar  — band-passed brown noise (combustion air); brightens + loudens with throttle
function setupEngine() {
  const core = ctx.createOscillator(); core.type = 'sawtooth'; core.frequency.value = 60;
  const coreLP = ctx.createBiquadFilter(); coreLP.type = 'lowpass'; coreLP.frequency.value = 500; coreLP.Q.value = 0.5;
  const coreGain = ctx.createGain(); coreGain.gain.value = 0;
  core.connect(coreLP); coreLP.connect(coreGain); coreGain.connect(masterGain); core.start();

  const whine = ctx.createOscillator(); whine.type = 'triangle'; whine.frequency.value = 600;
  const whineGain = ctx.createGain(); whineGain.gain.value = 0;
  whine.connect(whineGain); whineGain.connect(masterGain); whine.start();

  // brown noise (integrated white) — deeper, smoother roar than raw white noise
  const len = 2 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let lastN = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; lastN = (lastN + 0.02 * w) / 1.02; d[i] = lastN * 3.2; }
  const roar = ctx.createBufferSource(); roar.buffer = buf; roar.loop = true;
  const roarBP = ctx.createBiquadFilter(); roarBP.type = 'bandpass'; roarBP.frequency.value = 200; roarBP.Q.value = 0.9;
  const roarGain = ctx.createGain(); roarGain.gain.value = 0;
  roar.connect(roarBP); roarBP.connect(roarGain); roarGain.connect(masterGain); roar.start();

  nodes.engine = { core, coreLP, coreGain, whine, whineGain, roar, roarBP, roarGain };
}

/**
 * @param throttle 0..1
 * @param engineHp 0..1 — subtly drops volume when the engine is degraded.
 */
export function setEngine(throttle, engineHp = 1.0) {
  if (!started) return;
  const t = ctx.currentTime, tau = 0.08;
  const thr = Math.max(0, Math.min(1, throttle));
  const hp = Math.max(0.3, engineHp);
  const rpm = 0.12 + thr * 0.88;               // idle floor so it never sub-audibly buzzes
  const e = nodes.engine;
  // core body tone: 52 → 140 Hz (single voice — no beating)
  e.core.frequency.setTargetAtTime(52 + rpm * 95, t, tau);
  e.coreLP.frequency.setTargetAtTime(350 + thr * 1100, t, tau);
  e.coreGain.gain.setTargetAtTime((0.025 + thr * 0.075) * hp, t, tau);
  // turbine whine: 520 → 2600 Hz, grows ∝ throttle² for a spool-up feel
  e.whine.frequency.setTargetAtTime(520 + rpm * 2100, t, tau);
  e.whineGain.gain.setTargetAtTime((0.006 + thr * thr * 0.03) * hp, t, tau);
  // combustion roar: brighter + louder with throttle
  e.roarBP.frequency.setTargetAtTime(160 + thr * 520, t, tau);
  e.roarGain.gain.setTargetAtTime((0.02 + thr * 0.11) * hp, t, tau);
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
