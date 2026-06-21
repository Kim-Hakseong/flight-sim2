// Volumetric-ish cloud field (M31): clusters of soft billboard sprites forming
// cumulus puffs, scattered around the world and drifting slowly with the wind.
// Procedural (canvas) texture — no external assets — and a seeded layout so the
// sky is deterministic like the rest of the world.
//
// COORDINATE: Three.js right-handed, +Y up.

import { makeRng } from './sensors.js';

const THREE = window.THREE;

// Soft radial puff texture (white, feathered alpha).
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/**
 * Build a drifting cloud field and add it to the scene.
 * @returns {THREE.Group} the cloud field (pass to driftClouds each frame)
 */
export function buildClouds(scene, opts = {}) {
  const rnd = makeRng(0xC10D);
  const tex = cloudTexture();
  const field = new THREE.Group();
  field.name = 'clouds';
  field.userData.drift = 0;
  const count = opts.count || 46;

  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(rnd() * 6);
    const base = 130 + rnd() * 240;
    for (let j = 0; j < puffs; j++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, fog: true,
        opacity: 0.55 + rnd() * 0.25, color: 0xdfe8f4,
      });
      const s = new THREE.Sprite(mat);
      const sc = base * (0.5 + rnd() * 0.9);
      s.scale.set(sc, sc * 0.62, 1);
      s.position.set((rnd() - 0.5) * base * 1.9, (rnd() - 0.5) * base * 0.28, (rnd() - 0.5) * base * 1.1);
      cloud.add(s);
    }
    // Scatter around the world, well above the buildings, biased to the north
    // (the demo flies/lands toward -z) so there's sky scenery along the route.
    const ang = rnd() * Math.PI * 2;
    const dist = 1200 + rnd() * 5200;
    cloud.position.set(Math.cos(ang) * dist, 520 + rnd() * 1000, Math.sin(ang) * dist - 1500);
    field.add(cloud);
  }
  scene.add(field);
  return field;
}

/** Drift the whole field slowly with the prevailing wind, wrapping to stay around. */
export function driftClouds(field, dt) {
  if (!field) return;
  field.userData.drift += dt * 5.5;     // ~5.5 m/s
  if (field.userData.drift > 4000) field.userData.drift -= 8000;
  field.position.x = field.userData.drift;
}
