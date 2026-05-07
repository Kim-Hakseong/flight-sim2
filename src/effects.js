// Particle effects: damage smoke, fire, sparks, engine exhaust.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
//
// We use a fixed-pool ring-buffer of THREE.Points so per-frame allocation is
// zero. Particles "die" by being pushed off-screen at y = -1e5 and become
// available for re-emission. CanvasTexture sprites are generated at module
// load — no external image files.

const THREE = window.THREE;

// ---------- Texture generation ----------

function makeSoftCircleTexture(rgb /* "255,200,80" or similar */) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0,    `rgba(${rgb}, 1.0)`);
  grad.addColorStop(0.45, `rgba(${rgb}, 0.55)`);
  grad.addColorStop(1,    `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

const TEXTURES = {
  smoke:   makeSoftCircleTexture('120,120,120'),
  fire:    makeSoftCircleTexture('255,140,40'),
  spark:   makeSoftCircleTexture('255,230,120'),
  exhaust: makeSoftCircleTexture('210,210,210'),
};

// ---------- ParticleSystem ----------

class ParticleSystem {
  /**
   * @param {object} opt
   *   scene         — THREE.Scene to add the points object to
   *   max           — pool size (also caps simultaneous particles)
   *   size          — point size (world units)
   *   color         — base color (hex)
   *   lifetime      — seconds before recycle
   *   texture       — sprite alpha map (CanvasTexture)
   *   blending      — THREE blending mode (Normal | Additive)
   *   gravity       — world Y accel applied to every particle (m/s²)
   *   drag          — linear drag (m/s² per (m/s))
   */
  constructor({ scene, max = 200, size = 1.4, color = 0xffffff, lifetime = 2.0,
                texture, blending = THREE.NormalBlending, gravity = 0, drag = 0.4 }) {
    this.max = max;
    this.lifetime = lifetime;
    this.gravity = gravity;
    this.drag = drag;

    this.positions  = new Float32Array(max * 3);
    this.velocities = new Float32Array(max * 3);
    this.ages       = new Float32Array(max);
    this.alive      = new Uint8Array(max);
    this.cursor = 0;

    // Push everything offscreen at startup so the buffer has well-defined data.
    for (let i = 0; i < max; i++) this.positions[i * 3 + 1] = -1e5;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry = geo;

    this.material = new THREE.PointsMaterial({
      color, size,
      map: texture,
      transparent: true,
      depthWrite: false,
      blending,
      sizeAttenuation: true,
      alphaTest: 0.01,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx = 0, vy = 0, vz = 0, jitter = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.alive[i] = 1;
    this.ages[i] = 0;
    const j = i * 3;
    this.positions[j]     = x;
    this.positions[j + 1] = y;
    this.positions[j + 2] = z;
    const r = jitter;
    this.velocities[j]     = vx + (Math.random() - 0.5) * r;
    this.velocities[j + 1] = vy + (Math.random() - 0.5) * r;
    this.velocities[j + 2] = vz + (Math.random() - 0.5) * r;
  }

  tick(dt) {
    const lifetime = this.lifetime;
    const drag = this.drag;
    const gravity = this.gravity;
    const damp = Math.exp(-drag * dt);

    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      this.ages[i] += dt;
      if (this.ages[i] >= lifetime) {
        this.alive[i] = 0;
        this.positions[i * 3 + 1] = -1e5;
        continue;
      }
      const j = i * 3;
      this.velocities[j]     *= damp;
      this.velocities[j + 1]  = this.velocities[j + 1] * damp + gravity * dt;
      this.velocities[j + 2] *= damp;
      this.positions[j]     += this.velocities[j]     * dt;
      this.positions[j + 1] += this.velocities[j + 1] * dt;
      this.positions[j + 2] += this.velocities[j + 2] * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------- Public bundle ----------

export function createEffects(scene) {
  return {
    smoke: new ParticleSystem({
      scene, max: 220, size: 4.0, color: 0xaaaaaa, lifetime: 3.5,
      texture: TEXTURES.smoke, blending: THREE.NormalBlending,
      gravity: 0.6, drag: 0.5,
    }),
    fire: new ParticleSystem({
      scene, max: 80, size: 2.4, color: 0xff8030, lifetime: 0.8,
      texture: TEXTURES.fire, blending: THREE.AdditiveBlending,
      gravity: 0.0, drag: 1.5,
    }),
    sparks: new ParticleSystem({
      scene, max: 120, size: 0.6, color: 0xffe080, lifetime: 0.7,
      texture: TEXTURES.spark, blending: THREE.AdditiveBlending,
      gravity: -2.0, drag: 0.4,
    }),
    exhaust: new ParticleSystem({
      scene, max: 160, size: 1.2, color: 0xeeeeee, lifetime: 0.6,
      texture: TEXTURES.exhaust, blending: THREE.NormalBlending,
      gravity: 0.0, drag: 2.5,
    }),
  };
}

export function tickEffects(effects, dt) {
  effects.smoke.tick(dt);
  effects.fire.tick(dt);
  effects.sparks.tick(dt);
  effects.exhaust.tick(dt);
}

/** Convenience: spawn a one-shot burst at a world position. */
export function emitBurst(system, count, x, y, z, vx = 0, vy = 0, vz = 0, jitter = 6) {
  for (let i = 0; i < count; i++) {
    system.emit(x, y, z, vx, vy, vz, jitter);
  }
}
