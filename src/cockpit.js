// Simple open cockpit (M46): a minimal glareshield + canopy side rails + a centre
// flight-control stick that deflects with pilot/autopilot input. Deliberately
// sparse — the earlier glass flight-deck blocked the forward view, so this keeps
// the windscreen wide open and just frames the bottom + gives the pilot a stick.
//
// COORDINATE: built eye-relative — origin = pilot eye, -Z forward, +Y up, +X right.
// updateCockpit() places this group at the camera and orients it with the view.

const THREE = window.THREE;

export function buildCockpit() {
  const g = new THREE.Group();
  g.name = 'cockpit';
  const shell = new THREE.MeshStandardMaterial({ color: 0x14171b, metalness: 0.2, roughness: 0.92 });
  const rail  = new THREE.MeshStandardMaterial({ color: 0x1d2127, metalness: 0.3, roughness: 0.82 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x282d34, metalness: 0.6, roughness: 0.45 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.25, roughness: 0.6 });

  // --- Glareshield / coaming: a low, wide hood across the bottom-front. Sits in the
  // lower third of the view so the horizon and forward scene stay clear. ---
  const coam = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.42), shell);
  coam.position.set(0, -0.42, -0.92);
  coam.rotation.x = 0.22;
  g.add(coam);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.045, 0.12), rail);
  lip.position.set(0, -0.37, -0.73); lip.rotation.x = 0.5; g.add(lip);

  // --- Canopy side rails: thin frames at the lower sides, angled up-and-back, so
  // the cockpit reads as a canopy without walling off the view. ---
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 1.25), rail);
    r.position.set(sx * 0.64, -0.32, -0.5);
    r.rotation.z = sx * 0.12; r.rotation.x = -0.16;
    g.add(r);
  }

  // --- Centre flight-control stick: a stylised HOTAS (Thrustmaster-like). A fixed
  // base console (plate + rim + gimbal ring) holds a tilting stick (rubber boot +
  // flattened grip + a WIDE button head, deliberately wider than the shaft so the
  // silhouette reads as a joystick, not a column). `assembly` positions/scales the
  // whole thing; `stick` is the part updateCockpit() tilts with the command. ---
  const silver = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, metalness: 0.45, roughness: 0.42 });
  const black  = new THREE.MeshStandardMaterial({ color: 0x121317, metalness: 0.3, roughness: 0.62 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xe07d1c, emissive: 0x3a1c00, roughness: 0.5 });
  const cyanMat   = new THREE.MeshStandardMaterial({ color: 0x2bb6c8, emissive: 0x06343a, roughness: 0.5 });

  const assembly = new THREE.Group();
  assembly.position.set(0, -0.70, -0.55);
  assembly.scale.setScalar(0.95);

  // base console: octagonal plate + silver rim + glowing gimbal ring + a few buttons
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 8), black);
  plate.position.y = 0.0; plate.rotation.y = Math.PI / 8; assembly.add(plate);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.014, 8), silver);
  rim.position.y = 0.028; rim.rotation.y = Math.PI / 8; assembly.add(rim);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.013, 8, 20), orangeMat);
  ring.position.y = 0.05; ring.rotation.x = Math.PI / 2; assembly.add(ring);
  // console buttons (HOTAS flavour): orange + cyan squares near the front corners
  for (const [bx, bz, mat] of [[-0.13, 0.1, orangeMat], [-0.13, 0.04, cyanMat], [0.13, 0.1, cyanMat], [0.13, 0.04, orangeMat]]) {
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.016, 0.035), mat);
    btn.position.set(bx, 0.03, bz); assembly.add(btn);
  }

  // tilting stick (pivot at the gimbal centre)
  const stick = new THREE.Group();
  stick.position.set(0, 0.05, 0);
  // rubber boot / gaiter (widens at the base)
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, 0.09, 14), black);
  boot.position.y = 0.05; stick.add(boot);
  // short metal neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.1, 12), silver);
  neck.position.y = 0.14; stick.add(neck);
  // flattened ergonomic grip (wider in X, deeper in Z than a cylinder → not phallic)
  const grip = new THREE.Group(); grip.position.y = 0.32; grip.rotation.x = -0.1;
  const gripCore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.14), gripMat);
  grip.add(gripCore);
  const gripFront = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.02), silver);
  gripFront.position.z = 0.075; grip.add(gripFront);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.55 }));
  trigger.position.set(0, -0.05, 0.082); grip.add(trigger);
  stick.add(grip);
  // WIDE button head on top, tilted toward the pilot — the key anti-phallic shape
  const head = new THREE.Group(); head.position.set(0, 0.48, -0.01); head.rotation.x = -0.62;
  const headPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.045, 18), silver);
  headPlate.rotation.x = Math.PI / 2; head.add(headPlate);
  const headTrim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.01, 8, 22), black);
  head.add(headTrim);
  // controls on the head face (front = +Z of the head group): orange buttons, hat, thumb
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8), black);
  hat.rotation.x = Math.PI / 2; hat.position.set(0, 0.045, 0.024); head.add(hat);
  for (const hx of [-0.055, 0.055]) {
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.016, 12), orangeMat);
    ob.rotation.x = Math.PI / 2; ob.position.set(hx, -0.03, 0.024); head.add(ob);
  }
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), black);
  thumb.position.set(0, -0.005, 0.03); head.add(thumb);
  stick.add(head);

  assembly.add(stick);
  g.add(assembly);
  g.userData.stick = stick;
  g.userData.assembly = assembly;
  g.userData.coam = coam;
  g.userData.lip = lip;

  g.visible = false;
  return g;
}
