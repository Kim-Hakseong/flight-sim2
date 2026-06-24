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

  // --- Centre flight-control stick. Built on a pivot Group whose origin is the
  // base hinge; updateCockpit() rotates it with the control command so the grip
  // tips forward/back (pitch) and left/right (roll) like a real inceptor. ---
  const stick = new THREE.Group();
  stick.position.set(0, -0.7, -0.58);   // base hinge: lower centre, between the knees
  stick.scale.setScalar(1.2);           // sized to read clearly without blocking the horizon
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.055, 14), metal);
  base.position.y = 0.028; stick.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.32, 10), metal);
  shaft.position.y = 0.2; stick.add(shaft);
  // grip head, angled slightly toward the pilot
  const grip = new THREE.Group(); grip.position.y = 0.36; grip.rotation.x = -0.2;
  const gripBody = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.16, 12), gripMat);
  grip.add(gripBody);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), gripMat); cap.position.y = 0.085; grip.add(cap);
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.022), metal); hat.position.set(0, 0.055, 0.026); grip.add(hat);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.045, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.5 }));
  trigger.position.set(0, -0.02, 0.036); grip.add(trigger);
  stick.add(grip);
  g.add(stick);
  g.userData.stick = stick;
  g.userData.coam = coam;
  g.userData.lip = lip;

  g.visible = false;
  return g;
}
