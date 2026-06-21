// Static world: ground, runway, buildings, mountains, sky, lighting, fog.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.
//
// Each call to buildWorld also populates the colliders registry, so main.js
// can run aircraft-vs-world checks every frame without scanning the scene.

import { addBox, addCone } from './collision.js';
import { makeRng } from './sensors.js';

const THREE = window.THREE;

// Seeded RNG for world generation (M22): the building/mountain field must be
// IDENTICAL every load so the simulation is fully deterministic — otherwise a
// random obstacle layout makes flight tests (e.g. crosswind autoland) collide
// differently each run. Same project rule as the sensor PRNG ("no Math.random").
const rnd = makeRng(0x57A71C);

// Keep a clear approach corridor along the extended runway centreline (x≈0) so the
// autoland glidepath — which runs out past the runway to the touchdown point near
// z≈-4000 — is never blocked by a building or mountain. Airports clear the
// approach surface for exactly this reason.
const CORRIDOR_HALF_W = 550;   // m either side of the centreline
const CORRIDOR_Z_MAX  = 1100;  // clear all obstacles on the approach side (z below this)
function inApproachCorridor(x, z, pad = 0) {
  return Math.abs(x) < CORRIDOR_HALF_W + pad && z < CORRIDOR_Z_MAX;
}

export const RUNWAY_LENGTH = 2000;
export const RUNWAY_WIDTH = 60;
export const RUNWAY_START_Z = RUNWAY_LENGTH / 2 - 50;

// ---------- Procedural sky shader ----------

const SKY_VERT = `
  varying vec3 vWorldDirection;
  void main() {
    vWorldDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  varying vec3 vWorldDirection;
  uniform vec3 horizonColor;
  uniform vec3 zenithColor;
  uniform vec3 groundColor;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;

  void main() {
    float h = vWorldDirection.y;
    // Mix ground (below horizon) → horizon → zenith.
    vec3 col;
    if (h < 0.0) {
      col = mix(horizonColor, groundColor, clamp(-h * 1.5, 0.0, 1.0));
    } else {
      // Smooth horizon-to-zenith gradient with a steep exponent for that
      // crisp band near the horizon.
      float t = pow(clamp(h, 0.0, 1.0), 0.55);
      col = mix(horizonColor, zenithColor, t);
    }

    // Sun glow / disc (cheap inverse falloff).
    float sunDot = max(0.0, dot(normalize(vWorldDirection), normalize(sunDirection)));
    float disc = smoothstep(0.9985, 0.9995, sunDot);
    float halo = pow(sunDot, 280.0);
    col += sunColor * (halo * 0.7 + disc * 4.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function buildSky(scene, sunDirection) {
  const skyGeom = new THREE.SphereGeometry(8000, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      horizonColor: { value: new THREE.Color(0xc7d6e6) },
      zenithColor:  { value: new THREE.Color(0x2a55a8) },
      groundColor:  { value: new THREE.Color(0x4a6058) },
      sunDirection: { value: sunDirection.clone() },
      sunColor:     { value: new THREE.Color(0xfff4d6) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const sky = new THREE.Mesh(skyGeom, skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

// ---------- World construction ----------

export function buildWorld(scene, colliders) {
  const sunDir = new THREE.Vector3(0.55, 0.7, -0.35).normalize();

  buildSky(scene, sunDir);
  scene.fog = new THREE.Fog(0xc7d6e6, 1500, 9500);

  // Lights: hemisphere for sky/ground tint + key directional sun + soft fill.
  const hemi = new THREE.HemisphereLight(0xe2efff, 0x556644, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.05);
  sun.position.copy(sunDir).multiplyScalar(2000);
  // Shadow map (M30): a tight orthographic frustum that main.js re-centres on the
  // aircraft each frame, so shadows stay crisp without covering the whole world.
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  const sc = sun.shadow.camera;
  sc.near = 1; sc.far = 1200; sc.left = -180; sc.right = 180; sc.top = 180; sc.bottom = -180;
  sun.userData.dir = sunDir.clone();   // fixed light direction (main.js follows with it)
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.AmbientLight(0x223344, 0.25);
  scene.add(fill);

  buildGround(scene);
  buildRunway(scene);
  buildBuildings(scene, colliders, 70);
  buildMountains(scene, colliders, 35);

  return { sun };
}

function buildGround(scene) {
  // Multi-octave fractal noise + altitude-banded vertex colors.
  const seg = 140;
  const geom = new THREE.PlaneGeometry(20000, 20000, seg, seg);
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  function fbm(x, y) {
    let amp = 1, freq = 1, h = 0;
    for (let o = 0; o < 4; o++) {
      h += amp * (
        Math.sin(x * freq * 0.0009 + o * 1.7) +
        Math.cos(y * freq * 0.0011 + o * 2.3) +
        Math.sin((x + y) * freq * 0.0006 + o * 0.9)
      );
      amp *= 0.5;
      freq *= 2.05;
    }
    return h * 18;   // overall height scale
  }

  // Color stops by elevation.
  const C_GRASS = [0.30, 0.45, 0.20];
  const C_DIRT  = [0.45, 0.36, 0.22];
  const C_ROCK  = [0.42, 0.40, 0.36];
  const C_SNOW  = [0.92, 0.94, 0.96];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function colorFor(h) {
    if (h < 8)  return C_GRASS;
    if (h < 30) {
      const t = (h - 8) / 22;
      return [lerp(C_GRASS[0], C_DIRT[0], t), lerp(C_GRASS[1], C_DIRT[1], t), lerp(C_GRASS[2], C_DIRT[2], t)];
    }
    if (h < 80) {
      const t = (h - 30) / 50;
      return [lerp(C_DIRT[0], C_ROCK[0], t), lerp(C_DIRT[1], C_ROCK[1], t), lerp(C_DIRT[2], C_ROCK[2], t)];
    }
    const t = Math.min(1, (h - 80) / 60);
    return [lerp(C_ROCK[0], C_SNOW[0], t), lerp(C_ROCK[1], C_SNOW[1], t), lerp(C_ROCK[2], C_SNOW[2], t)];
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const distToRunway = Math.abs(x);
    const flatten = Math.max(0, 1 - distToRunway / 700);
    const h = fbm(x, y) * (1 - flatten);
    pos.setZ(i, h);
    const c = colorFor(h);
    colors[i * 3]     = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(geom, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildRunway(scene) {
  // Asphalt strip + shoulders.
  const shoulder = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY_WIDTH + 16, RUNWAY_LENGTH + 30),
    new THREE.MeshLambertMaterial({ color: 0x33342d }),
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.set(0, 0.04, 0);
  shoulder.receiveShadow = true;
  scene.add(shoulder);

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY_WIDTH, RUNWAY_LENGTH),
    new THREE.MeshLambertMaterial({ color: 0x1a1c1f }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.05, 0);
  runway.receiveShadow = true;
  scene.add(runway);

  // Centerline dashes.
  const dashGeom = new THREE.PlaneGeometry(0.7, 14);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xefefef });
  const dashCount = 60;
  const spacing = RUNWAY_LENGTH / dashCount;
  for (let i = 0; i < dashCount; i++) {
    const dash = new THREE.Mesh(dashGeom, dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.06, -RUNWAY_LENGTH / 2 + spacing / 2 + i * spacing);
    scene.add(dash);
  }

  // Threshold bars.
  const thrMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const thrGeom = new THREE.PlaneGeometry(RUNWAY_WIDTH * 0.85, 4);
  for (const z of [-RUNWAY_LENGTH / 2 + 6, RUNWAY_LENGTH / 2 - 6]) {
    const t = new THREE.Mesh(thrGeom, thrMat);
    t.rotation.x = -Math.PI / 2;
    t.position.set(0, 0.07, z);
    scene.add(t);
  }

  // Edge lights (small bright cubes, no actual light emission for perf).
  const lightGeom = new THREE.BoxGeometry(0.6, 0.4, 0.6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const edgeCount = 30;
  const edgeSpacing = RUNWAY_LENGTH / edgeCount;
  for (let i = 0; i < edgeCount; i++) {
    const z = -RUNWAY_LENGTH / 2 + i * edgeSpacing;
    for (const sx of [-RUNWAY_WIDTH / 2 - 1.5, RUNWAY_WIDTH / 2 + 1.5]) {
      const m = new THREE.Mesh(lightGeom, lightMat);
      m.position.set(sx, 0.3, z);
      scene.add(m);
    }
  }
}

function buildBuildings(scene, colliders, count) {
  const palette = [0xa6a09a, 0x8a8480, 0x6b6f74, 0xc4b9a8, 0x59636e, 0xb89878];
  const cubeGeom = new THREE.BoxGeometry(1, 1, 1);

  for (let i = 0; i < count; i++) {
    // Most are blocky office boxes; a few are taller/narrower towers.
    const isTower = rnd() < 0.25;
    const w = isTower ? 14 + rnd() * 12 : 18 + rnd() * 40;
    const d = isTower ? 14 + rnd() * 12 : 18 + rnd() * 40;
    const h = isTower ? 90 + rnd() * 180 : 22 + rnd() * 110;
    const color = palette[Math.floor(rnd() * palette.length)];
    const m = new THREE.Mesh(cubeGeom, new THREE.MeshLambertMaterial({ color }));
    m.scale.set(w, h, d);

    const side = rnd() < 0.5 ? -1 : 1;
    // Offset from the centreline starts beyond the approach corridor so buildings
    // never sit under the glidepath (the aircraft tracks ±~300 m of centreline).
    const x = side * (CORRIDOR_HALF_W + 60 + rnd() * 1100);
    const z = -RUNWAY_LENGTH / 2 + rnd() * RUNWAY_LENGTH * 1.5;
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);

    // Optional rooftop block (HVAC) on tall buildings.
    if (h > 80) {
      const rw = w * 0.4, rd = d * 0.4, rh = 4 + rnd() * 4;
      const r = new THREE.Mesh(cubeGeom, new THREE.MeshLambertMaterial({ color: 0x444444 }));
      r.scale.set(rw, rh, rd);
      r.position.set(x, h + rh / 2, z);
      scene.add(r);
    }

    addBox(colliders, {
      cx: x, cy: h / 2, cz: z,
      hx: w / 2, hy: h / 2, hz: d / 2,
    });
  }
}

function buildMountains(scene, colliders, count) {
  const baseGeom = new THREE.ConeGeometry(1, 1, 7);
  const matRock = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
  const matSnow = new THREE.MeshLambertMaterial({ color: 0xeaeaea });

  for (let i = 0; i < count; i++) {
    const r = 250 + rnd() * 500;
    const h = 500 + rnd() * 900;
    const m = new THREE.Mesh(baseGeom, matRock);
    m.scale.set(r, h, r);

    // Re-roll the position until it clears the approach corridor (bounded, so the
    // seeded RNG stays deterministic); give up after a few tries → skip this peak
    // rather than block the glidepath.
    let px, pz, tries = 0;
    do {
      const angle = rnd() * Math.PI * 2;
      const dist = 2800 + rnd() * 4000;
      px = Math.cos(angle) * dist;
      pz = Math.sin(angle) * dist;
      tries++;
    } while (inApproachCorridor(px, pz, r) && tries < 8);
    if (inApproachCorridor(px, pz, r)) continue;   // never place a peak on the glidepath
    m.position.set(px, h / 2 - 5, pz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);

    // Snowcap on the tallest peaks.
    if (h > 800) {
      const snow = new THREE.Mesh(baseGeom, matSnow);
      const sh = h * 0.25;
      const sr = r * 0.3;
      snow.scale.set(sr, sh, sr);
      snow.position.set(px, h - sh / 2 + h * 0.1, pz);
      scene.add(snow);
    }

    addCone(colliders, {
      cx: px, cy: h / 2 - 5 - h / 2, cz: pz, // cone base at world Y of base
      height: h, radius: r,
    });
  }
}
