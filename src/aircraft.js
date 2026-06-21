// Aircraft model library. Each builder returns a THREE.Group in the body frame
// (+X right wing, +Y top, -Z nose) exposing a common contract the sim relies on:
//   userData.gearOffset  — height of the wheels below the origin (ground clamp)
//   userData.prop         — spinning propeller group, or null for jets
//   userData.parts        — { leftWing, rightWing, tail, engine, tailStrobe } for
//                           damage hiding + the blinking strobe
//   userData.anchors      — body-frame points for particle emission
//                           { exhaust, leftWing, rightWing, tail, engine, fuselage }
//   userData.afterburner  — (jets) cone mesh toggled with throttle
//
// COORDINATE: Three.js right-handed, +Y up, -Z forward. Body: +X right, -Z nose.

const THREE = window.THREE;

// ---- shared materials (military palette) -----------------------------------
function mats(scheme = 'jet') {
  const palette = {
    jet: { body: 0x6c727a, body2: 0x565b62, accent: 0x2a2f36, dark: 0x202327 },
    grey: { body: 0x8a9099, body2: 0x6f757d, accent: 0x3a3f46, dark: 0x24272b },
    trainer: { body: 0xeceee8, body2: 0xd6d8d2, accent: 0x153b80, dark: 0xc0202c },
  }[scheme] || {};
  return {
    body:   new THREE.MeshStandardMaterial({ color: palette.body, metalness: 0.35, roughness: 0.6 }),
    body2:  new THREE.MeshStandardMaterial({ color: palette.body2, metalness: 0.35, roughness: 0.65 }),
    accent: new THREE.MeshStandardMaterial({ color: palette.accent, metalness: 0.4, roughness: 0.5 }),
    dark:   new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.5, roughness: 0.45 }),
    metal:  new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.35 }),
    glass:  new THREE.MeshStandardMaterial({ color: 0x141c24, metalness: 0.9, roughness: 0.08,
              transparent: true, opacity: 0.62 }),
    nozzle: new THREE.MeshStandardMaterial({ color: 0x33373c, metalness: 0.85, roughness: 0.4 }),
  };
}

function navLight(color, x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

// A short pylon + missile under a wing (military silhouette).
function makeStore(mat, x, y, z, len = 1.8) {
  const g = new THREE.Group();
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.5), mat.dark);
  pylon.position.set(x, y - 0.18, z);
  g.add(pylon);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 10), mat.metal);
  body.rotation.x = Math.PI / 2;
  body.position.set(x, y - 0.42, z);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 10), mat.metal);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(x, y - 0.42, z - len / 2 - 0.2);
  g.add(nose);
  // tail fins
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.3), mat.dark);
  fin.position.set(x, y - 0.42, z + len / 2);
  g.add(fin);
  const fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2; g.add(fin2);
  return g;
}

// ===========================================================================
// F-16-style single-engine fighter (default).
// ===========================================================================
export function buildF16() {
  const g = new THREE.Group();
  g.name = 'aircraft';
  const M = mats('jet');

  // Fuselage: long blended body. Tapered cylinder + nose cone + nozzle.
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 7.2, 20), M.body);
  fus.rotation.x = Math.PI / 2;
  fus.position.z = 0.2;
  g.add(fus);

  // Pointed radome nose.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 20), M.body2);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.6;
  g.add(nose);
  const pitotTip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), M.dark);
  pitotTip.rotation.x = Math.PI / 2; pitotTip.position.z = -6.2; g.add(pitotTip);

  // Chined forebody (LERX-like) flats blending nose to wing.
  const chineL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 3.2), M.body2);
  chineL.position.set(-0.55, 0.05, -2.2); chineL.rotation.y = 0.18; g.add(chineL);
  const chineR = chineL.clone(); chineR.position.x = 0.55; chineR.rotation.y = -0.18; g.add(chineR);

  // Underside engine intake (the F-16's signature ventral inlet).
  const intake = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.6), M.dark);
  intake.position.set(0, -0.55, -1.6); g.add(intake);
  const intakeLip = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 10, 18), M.nozzle);
  intakeLip.position.set(0, -0.7, -2.45); intakeLip.scale.set(1.2, 0.9, 1); g.add(intakeLip);

  // Bubble canopy.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
  canopy.position.set(0, 0.5, -2.2); canopy.scale.set(0.95, 1.0, 2.4); g.add(canopy);
  const canopySill = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.6), M.accent);
  canopySill.position.set(0, 0.42, -2.1); g.add(canopySill);

  // Exhaust nozzle (afterburner can).
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.0, 18), M.nozzle);
  nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 4.1; g.add(nozzle);
  const nozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 18), M.dark);
  nozzleRing.position.z = 4.5; g.add(nozzleRing);
  // Afterburner glow cone (toggled by throttle in main).
  const afterburner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.2, 14),
    new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: 0.0 }));
  afterburner.rotation.x = -Math.PI / 2; afterburner.position.z = 5.6; g.add(afterburner);

  // Wings: cropped-delta, mid-mounted, slight sweep.
  function wing(sign) {
    const wg = new THREE.Group();
    wg.name = sign > 0 ? 'rightWing' : 'leftWing';
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.9); shape.lineTo(0, 1.4); shape.lineTo(3.6, 0.5);
    shape.lineTo(3.6, 0.0); shape.lineTo(0, -0.9);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    const w = new THREE.Mesh(geo, M.body);
    w.rotation.x = -Math.PI / 2;
    w.position.set(sign * 0.55, 0.05, 1.0);
    w.scale.x = sign;
    wg.add(w);
    wg.add(navLight(sign > 0 ? 0x22ff44 : 0xff3030, sign * 4.15, 0.1, 0.6));
    // wingtip missile rail
    wg.add(makeStore(M, sign * 4.0, 0.1, 0.8, 1.6));
    return wg;
  }
  const leftWing = wing(-1), rightWing = wing(+1);
  g.add(leftWing); g.add(rightWing);

  // Tail group: single swept vertical fin + all-moving stabilators + ventral fins.
  const tail = new THREE.Group(); tail.name = 'tail';
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0.2, 2.0); finShape.lineTo(1.2, 2.0);
  finShape.lineTo(1.6, 0); finShape.lineTo(0, 0);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false }), M.body);
  fin.rotation.y = Math.PI / 2; fin.position.set(0.05, 0.35, 3.0); tail.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.5), M.accent);
  finTip.position.set(0, 2.5, 3.4); tail.add(finTip);
  // stabilators
  function stab(sign) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.1), M.body);
    s.position.set(sign * 1.4, 0.1, 3.5); s.rotation.y = sign * -0.25; return s;
  }
  tail.add(stab(-1)); tail.add(stab(1));
  // ventral fins
  const vfL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.9), M.accent);
  vfL.position.set(-0.5, -0.55, 3.4); vfL.rotation.z = 0.3; tail.add(vfL);
  const vfR = vfL.clone(); vfR.position.x = 0.5; vfR.rotation.z = -0.3; tail.add(vfR);
  const tailStrobe = navLight(0xffffff, 0, 2.6, 3.4); tail.add(tailStrobe);
  g.add(tail);

  // Engine marker (for damage classification / smoke anchor).
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 12), M.nozzle);
  engine.rotation.x = Math.PI / 2; engine.position.z = 3.3; engine.visible = false; g.add(engine);

  // Landing gear (retracted look — short struts).
  function gear(x, z) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), M.dark);
    leg.position.set(x, -0.7, z); g.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), M.dark);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -1.0, z); g.add(wheel);
  }
  gear(-0.8, 0.6); gear(0.8, 0.6); gear(0, -2.2);

  g.userData.gearOffset = 1.1;
  g.userData.prop = null;
  g.userData.afterburner = afterburner;
  g.userData.parts = { leftWing, rightWing, tail, engine, tailStrobe };
  g.userData.anchors = {
    exhaust:   new THREE.Vector3(0, 0, 4.8),
    leftWing:  new THREE.Vector3(-3.5, 0.1, 0.6),
    rightWing: new THREE.Vector3(3.5, 0.1, 0.6),
    tail:      new THREE.Vector3(0, 1.8, 3.2),
    engine:    new THREE.Vector3(0, 0, 3.6),
    fuselage:  new THREE.Vector3(0, 0, 0),
  };
  return g;
}

// ===========================================================================
// Twin-tail naval fighter (F/A-18-style) — visual variety.
// ===========================================================================
export function buildHornet() {
  const g = new THREE.Group();
  g.name = 'aircraft';
  const M = mats('grey');

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 6.8, 20), M.body);
  fus.rotation.x = Math.PI / 2; fus.position.z = 0.2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 20), M.body2);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -4.4; g.add(nose);

  // Big LERX (leading-edge extensions) — Hornet signature.
  const lerxL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 2.6), M.body2);
  lerxL.position.set(-0.7, 0.15, -1.4); lerxL.rotation.y = 0.3; g.add(lerxL);
  const lerxR = lerxL.clone(); lerxR.position.x = 0.7; lerxR.rotation.y = -0.3; g.add(lerxR);

  // Side intakes.
  const inL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 1.6), M.dark);
  inL.position.set(-0.7, -0.2, -0.8); g.add(inL);
  const inR = inL.clone(); inR.position.x = 0.7; g.add(inR);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
  canopy.position.set(0, 0.55, -2.0); canopy.scale.set(0.95, 1.0, 2.2); g.add(canopy);

  // Twin nozzles.
  const afterburners = [];
  function nozzle(sign) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 16), M.nozzle);
    n.rotation.x = Math.PI / 2; n.position.set(sign * 0.4, -0.05, 3.9); g.add(n);
    const ab = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.8, 12),
      new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: 0 }));
    ab.rotation.x = -Math.PI / 2; ab.position.set(sign * 0.4, -0.05, 5.2); g.add(ab);
    afterburners.push(ab);
  }
  nozzle(-1); nozzle(1);

  function wing(sign) {
    const wg = new THREE.Group();
    wg.name = sign > 0 ? 'rightWing' : 'leftWing';
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.8); shape.lineTo(0, 1.2); shape.lineTo(3.4, 0.6);
    shape.lineTo(3.4, 0.2); shape.lineTo(0, -0.8);
    const w = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), M.body);
    w.rotation.x = -Math.PI / 2; w.position.set(sign * 0.6, 0.1, 0.6); w.scale.x = sign; wg.add(w);
    wg.add(navLight(sign > 0 ? 0x22ff44 : 0xff3030, sign * 3.9, 0.15, 0.2));
    wg.add(makeStore(M, sign * 2.4, 0.1, 0.6, 1.8));
    return wg;
  }
  const leftWing = wing(-1), rightWing = wing(+1);
  g.add(leftWing); g.add(rightWing);

  const tail = new THREE.Group(); tail.name = 'tail';
  function vfin(sign) {
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0); finShape.lineTo(0.3, 1.7); finShape.lineTo(1.1, 1.7); finShape.lineTo(1.5, 0);
    const f = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.09, bevelEnabled: false }), M.body);
    f.rotation.y = Math.PI / 2; f.position.set(sign * 0.6, 0.3, 2.9); f.rotation.z = sign * 0.32; tail.add(f);
  }
  vfin(-1); vfin(1);
  function stab(sign) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.0), M.body);
    s.position.set(sign * 1.3, 0.05, 3.6); s.rotation.y = sign * -0.3; tail.add(s);
  }
  stab(-1); stab(1);
  const tailStrobe = navLight(0xffffff, 0, 1.9, 3.0); tail.add(tailStrobe);
  g.add(tail);

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12), M.nozzle);
  engine.rotation.x = Math.PI / 2; engine.position.z = 3.3; engine.visible = false; g.add(engine);

  function gear(x, z) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), M.dark);
    leg.position.set(x, -0.75, z); g.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), M.dark);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -1.05, z); g.add(wheel);
  }
  gear(-0.85, 0.5); gear(0.85, 0.5); gear(0, -2.0);

  g.userData.gearOffset = 1.15;
  g.userData.prop = null;
  g.userData.afterburner = afterburners[0];
  g.userData.afterburners = afterburners;
  g.userData.parts = { leftWing, rightWing, tail, engine, tailStrobe };
  g.userData.anchors = {
    exhaust:   new THREE.Vector3(0, -0.05, 4.6),
    leftWing:  new THREE.Vector3(-3.4, 0.1, 0.4),
    rightWing: new THREE.Vector3(3.4, 0.1, 0.4),
    tail:      new THREE.Vector3(0, 1.4, 3.0),
    engine:    new THREE.Vector3(0, 0, 3.6),
    fuselage:  new THREE.Vector3(0, 0, 0),
  };
  return g;
}

// ===========================================================================
// Light trainer (the original Cessna-ish prop plane) — kept as an option.
// ===========================================================================
export function buildLightPlane() {
  const group = new THREE.Group();
  group.name = 'aircraft';
  const M = mats('trainer');
  const bodyMat = M.body, accentMat = M.accent, stripeMat = M.dark;
  const propMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.7 });
  const glassMat = M.glass, metalMat = M.metal;

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.55, 6.0, 18), bodyMat);
  fus.rotation.x = Math.PI / 2; group.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 18), bodyMat);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -3.7; group.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 18), bodyMat);
  tailCone.rotation.x = Math.PI / 2; tailCone.position.z = 3.8; group.add(tailCone);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
  canopy.position.set(0, 0.45, -0.4); canopy.scale.set(1.0, 0.7, 1.7); group.add(canopy);

  function makeWing(sign) {
    const wingGroup = new THREE.Group();
    wingGroup.name = sign > 0 ? 'rightWing' : 'leftWing';
    const root = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.18, 1.6), bodyMat);
    root.position.set(sign * 1.85, 0.35, -0.2); wingGroup.add(root);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 1.4), bodyMat);
    tip.position.set(sign * 4.6, 0.36, -0.25); wingGroup.add(tip);
    wingGroup.add(navLight(sign > 0 ? 0x22ff44 : 0xff3030, sign * 5.55, 0.45, -0.25));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.05, 0.35), accentMat);
    stripe.position.set(sign * 2.8, 0.46, -0.55); wingGroup.add(stripe);
    return wingGroup;
  }
  const leftWing = makeWing(-1), rightWing = makeWing(+1);
  group.add(leftWing); group.add(rightWing);

  const tailGroup = new THREE.Group(); tailGroup.name = 'tail';
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.95), bodyMat);
  hStab.position.set(0, 0.45, 3.6); tailGroup.add(hStab);
  const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 1.2), bodyMat);
  vStab.position.set(0, 1.05, 3.6); tailGroup.add(vStab);
  const tailStrobe = navLight(0xffffff, 0, 1.7, 3.6); tailGroup.add(tailStrobe);
  group.add(tailGroup);

  const engineHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 14), metalMat);
  engineHousing.rotation.x = Math.PI / 2; engineHousing.position.set(0, 0, -4.2); group.add(engineHousing);

  const propGroup = new THREE.Group();
  propGroup.position.set(0, 0, -4.55);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 10), propMat);
  hub.rotation.x = Math.PI / 2; propGroup.add(hub);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.10, 0.22), propMat); propGroup.add(blade);
  const blade2 = blade.clone(); blade2.rotation.z = Math.PI / 2; propGroup.add(blade2);
  group.add(propGroup);

  function makeGear(x, z) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), M.dark);
    leg.position.set(x, -0.35, z); group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), M.dark);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -0.7, z); group.add(wheel);
  }
  makeGear(-1.6, 0.3); makeGear(1.6, 0.3); makeGear(0, -3.0);

  group.userData.gearOffset = 0.8;
  group.userData.prop = propGroup;
  group.userData.afterburner = null;
  group.userData.parts = { leftWing, rightWing, tail: tailGroup, engine: engineHousing, tailStrobe };
  group.userData.anchors = {
    exhaust:   new THREE.Vector3(0.30, -0.35, -2.85),
    leftWing:  new THREE.Vector3(-3.5, 0.40, -0.20),
    rightWing: new THREE.Vector3(3.5, 0.40, -0.20),
    tail:      new THREE.Vector3(0.0, 1.10, 3.60),
    engine:    new THREE.Vector3(0.0, 0.00, -4.20),
    fuselage:  new THREE.Vector3(0.0, 0.00, 0.00),
  };
  return group;
}

// ---- registry --------------------------------------------------------------
export const AIRCRAFT_MODELS = {
  f16:     { label: 'F-16 Falcon',   role: '다목적 전투기',   build: buildF16,       jet: true },
  hornet:  { label: 'F/A-18 Hornet', role: '함재 전투기',     build: buildHornet,    jet: true },
  trainer: { label: 'Light Trainer', role: '훈련/경비행기',   build: buildLightPlane, jet: false },
};
export const DEFAULT_MODEL = 'f16';

// Dispatcher. `buildAircraft()` defaults to the F-16 so the sim opens on a jet.
export function buildAircraft(key = DEFAULT_MODEL) {
  const entry = AIRCRAFT_MODELS[key] || AIRCRAFT_MODELS[DEFAULT_MODEL];
  const g = entry.build();
  g.userData.modelKey = key;
  return g;
}
