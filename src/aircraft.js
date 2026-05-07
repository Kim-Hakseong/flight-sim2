// Procedural Cessna-ish aircraft with named damage anchors and a wingtip-light
// rig that the main loop blinks. Higher-detail than the M2 baseline:
//   - separated wing root + tip pieces so a "torn" wing can later disappear
//   - canopy frame, antenna mast, pitot tube
//   - exhaust pipe behind the engine (anchor for exhaust particles)
//   - wingtip nav lights (red/green) + tail strobe
//
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.

const THREE = window.THREE;

export function buildAircraft() {
  const group = new THREE.Group();
  group.name = 'aircraft';

  const bodyMat   = new THREE.MeshLambertMaterial({ color: 0xeceee8 });
  const accentMat = new THREE.MeshLambertMaterial({ color: 0x153b80 });
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xc0202c });
  const propMat   = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const glassMat  = new THREE.MeshPhongMaterial({
    color: 0x6cbcd9, transparent: true, opacity: 0.55,
    shininess: 80, specular: 0x88ccee,
  });
  const gearMat   = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const metalMat  = new THREE.MeshLambertMaterial({ color: 0x6e6e6e });

  // -------- Fuselage (capsule) ----------------------------------------------
  const fus = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.55, 6.0, 18),
    bodyMat,
  );
  fus.rotation.x = Math.PI / 2;
  group.add(fus);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 18), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.7;
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 18), bodyMat);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 3.8;
  group.add(tailCone);

  // Belly stripe.
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 6.0), stripeMat);
  belly.position.set(0, -0.55, 0);
  group.add(belly);

  // -------- Cockpit canopy + frame -----------------------------------------
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    glassMat,
  );
  canopy.position.set(0, 0.45, -0.4);
  canopy.scale.set(1.0, 0.7, 1.7);
  group.add(canopy);

  const canopyFrame = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.04, 8, 24, Math.PI),
    metalMat,
  );
  canopyFrame.position.set(0, 0.45, 0.5);
  canopyFrame.scale.set(1.0, 0.7, 1.0);
  canopyFrame.rotation.x = -Math.PI / 2;
  group.add(canopyFrame);

  // -------- Wings: split into root + tip so we can hide tips on damage -----
  function makeWing(sign /* +1 right, -1 left */) {
    const wingGroup = new THREE.Group();
    wingGroup.name = sign > 0 ? 'rightWing' : 'leftWing';

    const root = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.18, 1.6), bodyMat);
    root.position.set(sign * 1.85, 0.35, -0.2);
    wingGroup.add(root);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 1.4), bodyMat);
    tip.position.set(sign * 4.6, 0.36, -0.25);
    wingGroup.add(tip);

    // Wingtip nav light (cube, BasicMaterial = self-lit appearance).
    const navColor = sign > 0 ? 0x22ff44 : 0xff3030; // right=green, left=red
    const navLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: navColor }),
    );
    navLight.position.set(sign * 5.55, 0.45, -0.25);
    wingGroup.add(navLight);

    // Accent stripe along the wing.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.05, 0.35), accentMat);
    stripe.position.set(sign * 2.8, 0.46, -0.55);
    wingGroup.add(stripe);

    return wingGroup;
  }
  const leftWing = makeWing(-1);
  const rightWing = makeWing(+1);
  group.add(leftWing);
  group.add(rightWing);

  // -------- Tail surfaces ---------------------------------------------------
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tail';

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.95), bodyMat);
  hStab.position.set(0, 0.45, 3.6);
  tailGroup.add(hStab);

  const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 1.2), bodyMat);
  vStab.position.set(0, 1.05, 3.6);
  tailGroup.add(vStab);

  // Vertical fin stripe.
  const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.7, 0.5), stripeMat);
  finStripe.position.set(0, 1.3, 3.85);
  tailGroup.add(finStripe);

  // Tail strobe.
  const tailStrobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  tailStrobe.position.set(0, 1.7, 3.6);
  tailGroup.add(tailStrobe);

  group.add(tailGroup);

  // -------- Engine + propeller ---------------------------------------------
  const engineHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.55, 0.5, 14),
    metalMat,
  );
  engineHousing.rotation.x = Math.PI / 2;
  engineHousing.position.set(0, 0, -4.2);
  group.add(engineHousing);

  const propGroup = new THREE.Group();
  propGroup.position.set(0, 0, -4.55);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 10), propMat);
  hub.rotation.x = Math.PI / 2;
  propGroup.add(hub);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.10, 0.22), propMat);
  propGroup.add(blade);
  const blade2 = blade.clone();
  blade2.rotation.z = Math.PI / 2;
  propGroup.add(blade2);
  group.add(propGroup);

  // Exhaust pipe (anchor for exhaust particles).
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8),
    new THREE.MeshLambertMaterial({ color: 0x202020 }),
  );
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0.3, -0.35, -3.0);
  group.add(pipe);

  // -------- Pitot tube + antenna -------------------------------------------
  const pitot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6),
    metalMat,
  );
  pitot.rotation.z = Math.PI / 2;
  pitot.position.set(2.5, 0.25, 0.0);
  group.add(pitot);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6),
    metalMat,
  );
  antenna.position.set(0, 0.85, 0.5);
  group.add(antenna);

  // -------- Landing gear ---------------------------------------------------
  function makeGear(x, z) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), gearMat);
    leg.position.set(x, -0.35, z);
    group.add(leg);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12),
      gearMat,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -0.7, z);
    group.add(wheel);
    return { leg, wheel };
  }
  makeGear(-1.6, 0.3);
  makeGear(1.6, 0.3);
  makeGear(0, -3.0);

  group.userData.gearOffset = 0.8;
  group.userData.prop = propGroup;
  group.userData.parts = {
    leftWing, rightWing, tail: tailGroup, engine: engineHousing,
    tailStrobe,
  };
  // Anchors in body frame for particle emission.
  group.userData.anchors = {
    exhaust:    new THREE.Vector3(0.30, -0.35, -2.85),
    leftWing:   new THREE.Vector3(-3.5, 0.40, -0.20),
    rightWing:  new THREE.Vector3( 3.5, 0.40, -0.20),
    tail:       new THREE.Vector3( 0.0, 1.10,  3.60),
    engine:     new THREE.Vector3( 0.0, 0.00, -4.20),
    fuselage:   new THREE.Vector3( 0.0, 0.00,  0.00),
  };
  return group;
}
