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

// Selectable maps (M34): each is a biome preset — sky/fog/terrain colours, light
// tint, and obstacle density. The runway is identical across maps (so the autoland
// always works); only the scenery changes. The chosen map is applied at load.
export const MAPS = {
  plains: {
    label: 'Plains', desc: '평원·도시',
    sky: { horizon: 0xc7d6e6, zenith: 0x2a55a8, ground: 0x4a6058, sun: 0xfff4d6 },
    fog: { color: 0xc7d6e6, near: 1500, far: 9500 },
    terrain: { grass: [0.30, 0.45, 0.20], dirt: [0.45, 0.36, 0.22], rock: [0.42, 0.40, 0.36], snow: [0.92, 0.94, 0.96], scale: 18 },
    hemi: { sky: 0xe2efff, ground: 0x556644, intensity: 0.7 },
    buildings: 70, mountains: { count: 35, rock: 0x5a4a3a },
    env: { sky: 0x2a55a8, horizon: 0xc7d6e6, ground: 0x3a4a40 },
  },
  desert: {
    label: 'Desert', desc: '사막·메사',
    sky: { horizon: 0xe6d4ad, zenith: 0x5d82bd, ground: 0x8a6a40, sun: 0xfff0c0 },
    fog: { color: 0xe2cfa6, near: 1200, far: 8200 },
    terrain: { grass: [0.62, 0.48, 0.28], dirt: [0.72, 0.55, 0.33], rock: [0.55, 0.42, 0.30], snow: [0.82, 0.68, 0.48], scale: 26 },
    hemi: { sky: 0xfff0d0, ground: 0x8a6a44, intensity: 0.85 },
    buildings: 22, mountains: { count: 42, rock: 0x8a6a44 },
    env: { sky: 0x5d82bd, horizon: 0xe6d4ad, ground: 0x8a6a44 },
  },
  arctic: {
    label: 'Arctic', desc: '설원·빙하',
    sky: { horizon: 0xdfeaf2, zenith: 0x4a78b0, ground: 0x9aa8b0, sun: 0xf0f6ff },
    fog: { color: 0xdfeaf2, near: 1100, far: 7800 },
    terrain: { grass: [0.80, 0.86, 0.92], dirt: [0.72, 0.80, 0.88], rock: [0.62, 0.70, 0.80], snow: [0.96, 0.98, 1.0], scale: 30 },
    hemi: { sky: 0xf0f8ff, ground: 0x90a0b0, intensity: 0.9 },
    buildings: 16, mountains: { count: 44, rock: 0x8090a0 },
    env: { sky: 0x4a78b0, horizon: 0xdfeaf2, ground: 0x90a0b0 },
  },
  ocean: {
    label: 'Ocean', desc: '대양·도서',
    sky: { horizon: 0xbfe0e8, zenith: 0x2f78b8, ground: 0x1a4a5a, sun: 0xfff4d6 },
    fog: { color: 0xbfe0e8, near: 2500, far: 12000 },
    terrain: { grass: [0.78, 0.72, 0.52], dirt: [0.72, 0.66, 0.46], rock: [0.50, 0.50, 0.48], snow: [0.92, 0.94, 0.96], scale: 10 },
    hemi: { sky: 0xdef0ff, ground: 0x244a55, intensity: 0.82 },
    buildings: 0, mountains: { count: 18, rock: 0x55615a },
    env: { sky: 0x2f78b8, horizon: 0xbfe0e8, ground: 0x12404e },
    water: { deep: 0x0a3450, shallow: 0x1f6f8c },  // real animated sea (M35)
    island: 1500,                                  // sand island radius around the runway
  },
  carrier: {
    label: 'Carrier', desc: '항모 갑판',
    sky: { horizon: 0xb8d6e0, zenith: 0x2c72b0, ground: 0x1a4a5a, sun: 0xfff4d6 },
    fog: { color: 0xb8d6e0, near: 2200, far: 11000 },
    terrain: { grass: [0.4, 0.42, 0.44], dirt: [0.4, 0.42, 0.44], rock: [0.45, 0.47, 0.49], snow: [0.9, 0.94, 0.96], scale: 8 },
    hemi: { sky: 0xdef0ff, ground: 0x2a4a55, intensity: 0.82 },
    buildings: 0, mountains: { count: 7, rock: 0x55615a },
    env: { sky: 0x2c72b0, horizon: 0xb8d6e0, ground: 0x12404e },
    water: { deep: 0x0a3450, shallow: 0x1f6f8c },
    carrier: true,                                 // build a flight deck (M36) not an island
  },
};
export const DEFAULT_MAP = 'plains';

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

function buildSky(scene, sunDirection, skyCfg = {}) {
  const skyGeom = new THREE.SphereGeometry(8000, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      horizonColor: { value: new THREE.Color(skyCfg.horizon ?? 0xc7d6e6) },
      zenithColor:  { value: new THREE.Color(skyCfg.zenith ?? 0x2a55a8) },
      groundColor:  { value: new THREE.Color(skyCfg.ground ?? 0x4a6058) },
      sunDirection: { value: sunDirection.clone() },
      sunColor:     { value: new THREE.Color(skyCfg.sun ?? 0xfff4d6) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const sky = new THREE.Mesh(skyGeom, skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

// ---------- Animated ocean (M35) ----------

const WATER_VERT = `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const WATER_FRAG = `
  precision highp float;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform vec3 uDeep, uShallow, uSky, uSun;
  uniform vec3 uSunDir;
  vec3 waveNormal(vec2 p) {
    float t = uTime;
    vec2 d = vec2(0.0);
    d += vec2(cos(p.x * 0.060 + t * 1.3), cos(p.y * 0.050 + t * 1.1)) * 0.060;
    d += vec2(cos(p.x * 0.130 - t * 0.9 + p.y * 0.05), cos(p.y * 0.110 + t * 1.4 + p.x * 0.04)) * 0.030;
    d += vec2(cos(p.x * 0.270 + t * 2.1), cos(p.y * 0.310 - t * 1.7)) * 0.015;
    return normalize(vec3(-d.x, 1.0, -d.y));
  }
  void main() {
    vec3 N = waveNormal(vWorldPos.xz);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);
    vec3 base = mix(uDeep, uShallow, clamp(dot(N, V) * 0.5, 0.0, 0.4));
    vec3 col = mix(base, uSky, clamp(fres, 0.0, 0.85));
    vec3 R = reflect(-V, N);
    float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 120.0);
    col += uSun * spec * 1.5;
    float dist = length(cameraPosition.xz - vWorldPos.xz);
    col = mix(col, uSky, clamp((dist - 2000.0) / 7000.0, 0.0, 0.85));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Returns the water mesh (its material.uniforms.uTime is advanced each frame).
function buildWater(parent, cfg, sunDir) {
  const geo = new THREE.PlaneGeometry(40000, 40000, 1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(cfg.water.deep) },
      uShallow: { value: new THREE.Color(cfg.water.shallow) },
      uSky: { value: new THREE.Color(cfg.sky.horizon) },
      uSun: { value: new THREE.Color(cfg.sky.sun) },
      uSunDir: { value: sunDir.clone() },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.4;            // just below the island so the shoreline reads
  m.name = 'water';
  parent.add(m);
  return m;
}

// Flat sand island that carries the runway on an ocean map.
function buildIsland(parent, radius) {
  const geo = new THREE.CircleGeometry(radius, 48);
  const mat = new THREE.MeshLambertMaterial({ color: 0xcdc09a, map: groundDetailTexture() });
  const isle = new THREE.Mesh(geo, mat);
  isle.rotation.x = -Math.PI / 2;
  isle.position.y = 0.0;
  isle.receiveShadow = true;
  parent.add(isle);
}

// Aircraft-carrier flight deck (M36): a long grey metal deck carrying the runway,
// with a starboard island superstructure, deck edge, and a sponson. Stylised /
// oversized (the runway is 2 km) but unmistakably a carrier deck on the sea.
function buildCarrierDeck(parent) {
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.5, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x33373c, metalness: 0.55, roughness: 0.6 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x6b7178, metalness: 0.5, roughness: 0.65 });
  const W = 320, L = RUNWAY_LENGTH + 200, TH = 14;

  // Main deck slab (top surface at y = -0.05, just under the runway markings).
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, TH, L), deckMat);
  deck.position.set(0, -0.05 - TH / 2, 0);
  deck.receiveShadow = true; deck.castShadow = true;
  parent.add(deck);

  // Angled / non-skid deck zones (subtle darker panels along the sides).
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(60, 0.3, L * 0.9), darkMat);
    panel.position.set(sx * (W / 2 - 45), 0.06, 0);
    panel.receiveShadow = true;
    parent.add(panel);
  }

  // Deck-edge catwalk rails (thin boxes around the perimeter).
  const railMat = darkMat;
  const railZ = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, L), railMat);
  railZ.position.set(-W / 2, 0.8, 0); parent.add(railZ);
  const railZ2 = railZ.clone(); railZ2.position.x = W / 2; parent.add(railZ2);

  // Starboard island superstructure (tower) — stacked boxes + mast + radar.
  const island = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(34, 30, 150), lightMat);
  base.position.set(0, 15, 0); base.castShadow = true; island.add(base);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 70), deckMat);
  bridge.position.set(0, 38, -10); bridge.castShadow = true; island.add(bridge);
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(20, 18, 40), darkMat);
  funnel.position.set(0, 39, 40); funnel.castShadow = true; island.add(funnel);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 8), darkMat);
  mast.position.set(0, 66, -10); mast.castShadow = true; island.add(mast);
  // spinning-look radar bar
  const radar = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 5), lightMat);
  radar.position.set(0, 50, -10); island.add(radar);
  island.position.set(W / 2 - 22, 0, 120);
  parent.add(island);

  // A couple of deck antennas / lights on the port edge.
  for (let i = -2; i <= 2; i++) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 6), darkMat);
    a.position.set(-W / 2 + 2, 3, i * 300);
    parent.add(a);
  }
}

// ---------- World construction ----------

export function buildWorld(scene, colliders, mapKey = DEFAULT_MAP) {
  const cfg = MAPS[mapKey] || MAPS[DEFAULT_MAP];
  const sunDir = new THREE.Vector3(0.55, 0.7, -0.35).normalize();

  scene.fog = new THREE.Fog(cfg.fog.color, cfg.fog.near, cfg.fog.far);

  // Lights: hemisphere for sky/ground tint + key directional sun + soft fill.
  // These are PERSISTENT across map swaps (only re-tinted), so the sun reference
  // main.js holds for the shadow frustum stays valid.
  const hemi = new THREE.HemisphereLight(cfg.hemi.sky, cfg.hemi.ground, cfg.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(cfg.sky.sun, 1.05);
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

  // Swappable scenery (sky/terrain/water/runway/buildings/mountains) in one group
  // so a live map swap (M35) can dispose + rebuild just this, keeping the lights.
  const group = new THREE.Group();
  group.name = 'mapContent';
  const content = buildMapContent(group, colliders, cfg, sunDir);
  scene.add(group);

  return { sun, hemi, fill, sunDir, group, water: content.water, skyMat: content.skyMat, env: cfg.env, mapKey };
}

// Build the swappable scenery for a map into `group`. Returns { water } (the
// animated ocean mesh, or null on land maps).
export function buildMapContent(group, colliders, cfg, sunDir) {
  const skyMesh = buildSky(group, sunDir, cfg.sky);
  let water = null;
  if (cfg.water) {
    water = buildWater(group, cfg, sunDir);
    if (cfg.carrier) buildCarrierDeck(group);
    else buildIsland(group, cfg.island || 1500);
  } else {
    buildGround(group, cfg.terrain);
  }
  buildRunway(group);
  if (cfg.buildings > 0) buildBuildings(group, colliders, cfg.buildings);
  buildMountains(group, colliders, cfg.mountains.count, cfg.mountains.rock);
  return { water, skyMat: skyMesh.material };
}

// Time-of-day / weather presets (M37). Each layers ON TOP of the map's biome:
// sun (direction = time of day, colour, intensity), hemisphere/ambient light,
// fog density, sky tint/darkening, exposure, and cloud look. Unspecified fields
// fall back to the map's defaults (so 'day' reproduces the base look per biome).
export const CONDITIONS = {
  day:      { label: 'Day',      desc: '주간 맑음', stars: 0, cloud: { opacity: 0.7, color: 0xdfe8f4 } },
  dusk:     { label: 'Dusk',     desc: '황혼',
    sunDir: [0.92, 0.15, -0.18], sunColor: 0xff9a55, sunInt: 1.0,
    hemiSky: 0xffd2a8, hemiGround: 0x4a3a30, hemiInt: 0.7, fillColor: 0x331f2e, fillInt: 0.32,
    exposure: 1.22, fogScale: 0.85, skyScale: 0.95, skyTint: 0xff8a45, skyTintAmt: 0.5,
    stars: 0.22, cloud: { opacity: 0.85, color: 0xffc090 } },
  night:    { label: 'Night',    desc: '야간',
    sunDir: [-0.25, 0.55, -0.4], sunColor: 0xaec0ea, sunInt: 0.16,
    hemiSky: 0x2a3a5a, hemiGround: 0x101822, hemiInt: 0.22, fillColor: 0x0c1426, fillInt: 0.5,
    exposure: 1.0, fogScale: 0.75, skyScale: 0.14, skyTint: 0x0a1430, skyTintAmt: 0.4,
    stars: 1.0, cloud: { opacity: 0.45, color: 0x2a3550 } },
  overcast: { label: 'Overcast', desc: '흐림',
    sunDir: [0.45, 0.85, -0.3], sunColor: 0xdfe6ee, sunInt: 0.5,
    hemiSky: 0xc8d4de, hemiGround: 0x6a7278, hemiInt: 1.15, fillColor: 0x40484f, fillInt: 0.42,
    exposure: 1.08, fogScale: 0.5, skyScale: 0.82, skyTint: 0xbcc6d0, skyTintAmt: 0.62,
    stars: 0, cloud: { opacity: 0.95, color: 0xb4bec8 } },
  fog:      { label: 'Fog',      desc: '안개',
    sunDir: [0.45, 0.7, -0.3], sunColor: 0xeef0f2, sunInt: 0.5,
    hemiSky: 0xdce2e8, hemiGround: 0x9aa0a6, hemiInt: 1.05, fillColor: 0x5a6066, fillInt: 0.5,
    exposure: 1.05, fogScale: 0.16, skyScale: 0.9, skyTint: 0xd6dbe0, skyTintAmt: 0.55,
    stars: 0, cloud: { opacity: 0.5, color: 0xcdd4da } },
  rain:     { label: 'Rain',     desc: '비',
    sunDir: [0.4, 0.85, -0.3], sunColor: 0xc6cdd6, sunInt: 0.4,
    hemiSky: 0x9aa6b2, hemiGround: 0x44494f, hemiInt: 1.0, fillColor: 0x363c44, fillInt: 0.45,
    exposure: 1.0, fogScale: 0.42, skyScale: 0.7, skyTint: 0x9aa4b0, skyTintAmt: 0.62,
    stars: 0, precip: 'rain', cloud: { opacity: 0.95, color: 0x9098a2 } },
  snow:     { label: 'Snow',     desc: '눈',
    sunDir: [0.4, 0.8, -0.3], sunColor: 0xeef2f6, sunInt: 0.55,
    hemiSky: 0xdfe6ee, hemiGround: 0x9aa4ac, hemiInt: 1.1, fillColor: 0x586068, fillInt: 0.5,
    exposure: 1.12, fogScale: 0.35, skyScale: 0.88, skyTint: 0xd2dae2, skyTintAmt: 0.6,
    stars: 0, precip: 'snow', cloud: { opacity: 0.95, color: 0xc6ccd2 } },
};
export const DEFAULT_CONDITION = 'day';

// Tileable grayscale value-noise for ground detail (modulates the vertex colour).
function groundDetailTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    // mottled noise centred near white so it only lightly darkens the terrain
    const n = 200 + Math.floor(rnd() * 55);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // soften
  ctx.globalAlpha = 0.5; ctx.filter = 'blur(1px)'; ctx.drawImage(c, 0, 0); ctx.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(80, 80);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function buildGround(scene, terrain = {}) {
  // Multi-octave fractal noise + altitude-banded vertex colors.
  const seg = 140;
  const geom = new THREE.PlaneGeometry(20000, 20000, seg, seg);
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const heightScale = terrain.scale ?? 18;

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
    return h * heightScale;   // overall height scale (per map)
  }

  // Color stops by elevation (per map biome).
  const C_GRASS = terrain.grass || [0.30, 0.45, 0.20];
  const C_DIRT  = terrain.dirt  || [0.45, 0.36, 0.22];
  const C_ROCK  = terrain.rock  || [0.42, 0.40, 0.36];
  const C_SNOW  = terrain.snow  || [0.92, 0.94, 0.96];
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

  // A subtle procedural detail texture (canvas value-noise) breaks up the flat
  // vertex-coloured terrain so it reads as ground rather than a solid sheet (M31).
  const detail = groundDetailTexture();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
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

function buildMountains(scene, colliders, count, rockColor = 0x5a4a3a) {
  const baseGeom = new THREE.ConeGeometry(1, 1, 7);
  const matRock = new THREE.MeshLambertMaterial({ color: rockColor });
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
