// Sky extras + precipitation (M38): a starfield and moon for night, and rain/snow
// particle systems for weather presets. All procedural (no external assets) and
// seeded where layout matters, consistent with the rest of the world.
//
// COORDINATE: Three.js right-handed, +Y up.

import { makeRng } from './sensors.js';

const THREE = window.THREE;

// ---- stars (upper-hemisphere point field, faded in at night) ----
export function buildStars() {
  const rnd = makeRng(0x57A25);
  const N = 1700, R = 7200;
  const pos = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const theta = rnd() * Math.PI * 2;
    const y = 0.12 + rnd() * 0.88;           // bias to the upper sky
    const s = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(theta) * s * R;
    pos[i * 3 + 1] = y * R;
    pos[i * 3 + 2] = Math.sin(theta) * s * R;
    siz[i] = 4 + rnd() * 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 7, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -2;
  pts.name = 'stars';
  return pts;
}

// ---- moon (glowing sprite, faded in at night; blooms nicely) ----
export function buildMoon() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(232,240,255,0.95)');
  g.addColorStop(1, 'rgba(200,215,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, color: 0xfdfdff });
  const moon = new THREE.Sprite(mat);
  moon.scale.set(750, 750, 1);
  moon.position.set(-2600, 4600, -5200);
  moon.renderOrder = -1;
  moon.name = 'moon';
  return moon;
}

export function setNightSky(stars, moon, amount) {
  if (stars) stars.material.opacity = amount;
  if (moon) moon.material.opacity = Math.min(1, amount * 1.25);
}

// ---- precipitation (rain / snow) ----
const BOX = 260;     // horizontal extent of the particle box around the camera
const HEIGHT = 200;  // vertical extent

function makePrecip(n, color, size, seed) {
  const rnd = makeRng(seed);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * BOX;
    pos[i * 3 + 1] = (rnd() - 0.5) * HEIGHT;
    pos[i * 3 + 2] = (rnd() - 0.5) * BOX;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false, fog: true,
  });
  const p = new THREE.Points(geo, mat);
  p.visible = false; p.frustumCulled = false;
  return p;
}

export function buildPrecip() {
  return {
    rain: makePrecip(2600, 0xaac6e2, 0.55, 0x4A1),
    snow: makePrecip(1500, 0xffffff, 1.5, 0x5B2),
  };
}

// Advance the active precipitation (follows the camera; particles recycle in the box).
export function updatePrecip(precip, camera, dt, mode) {
  precip.rain.visible = mode === 'rain';
  precip.snow.visible = mode === 'snow';
  const active = mode === 'rain' ? precip.rain : mode === 'snow' ? precip.snow : null;
  if (!active) return;
  active.position.copy(camera.position);
  const speed = mode === 'rain' ? 95 : 9;
  const arr = active.geometry.attributes.position.array;
  const H2 = HEIGHT / 2;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 1] -= speed * dt;
    if (mode === 'snow') arr[i] += Math.sin((arr[i + 1] + arr[i + 2]) * 0.05) * 4 * dt; // drift
    if (arr[i + 1] < -H2) { arr[i + 1] += HEIGHT; }
  }
  active.geometry.attributes.position.needsUpdate = true;
}
