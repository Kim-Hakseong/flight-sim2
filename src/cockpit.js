// Cockpit interior (M39): a 3D instrument panel — glareshield, three MFD screens
// (attitude + two nav/map displays), round gauges, a centre pedestal with throttle
// levers, side consoles and a control stick. Built in body-frame coordinates and
// shown only in the cockpit (V) view, so the pilot looks out over a real panel.
//
// COORDINATE: Three.js right-handed, +Y up, -Z nose. Panel sits forward (-Z) and
// below the pilot's eye point.

const THREE = window.THREE;

// ---- procedural MFD screen textures (canvas) ----
function attitudeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  // sky / ground split (artificial horizon)
  x.fillStyle = '#2a6fb0'; x.fillRect(0, 0, 128, 60);
  x.fillStyle = '#6a4a2a'; x.fillRect(0, 60, 128, 68);
  x.strokeStyle = '#eaf2ff'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 60); x.lineTo(128, 60); x.stroke();
  // pitch ladder
  x.lineWidth = 1.5;
  for (let p = -2; p <= 2; p++) { if (!p) continue; const y = 60 - p * 14; x.beginPath(); x.moveTo(44, y); x.lineTo(84, y); x.stroke(); }
  // aircraft symbol
  x.strokeStyle = '#ffd000'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(40, 64); x.lineTo(56, 64); x.moveTo(72, 64); x.lineTo(88, 64); x.moveTo(64, 60); x.lineTo(64, 68); x.stroke();
  return new THREE.CanvasTexture(c);
}
function navTexture(tint) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#06120c'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = tint; x.lineWidth = 1; x.globalAlpha = 0.5;
  for (let i = 16; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  x.globalAlpha = 1; x.strokeStyle = tint; x.lineWidth = 2;
  x.beginPath(); x.arc(64, 64, 40, 0, Math.PI * 2); x.stroke();          // range ring
  x.beginPath(); x.moveTo(64, 30); x.lineTo(58, 44); x.lineTo(70, 44); x.closePath(); x.fillStyle = tint; x.fill(); // heading caret
  // a couple of waypoint blips
  x.fillRect(86, 40, 4, 4); x.fillRect(44, 80, 4, 4);
  return new THREE.CanvasTexture(c);
}

function screen(tex, w, h) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),  // self-lit, blooms
  );
  return m;
}

export function buildCockpit() {
  const g = new THREE.Group();
  g.name = 'cockpit';
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.3, roughness: 0.85 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x202428, metalness: 0.35, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x35393e, metalness: 0.5, roughness: 0.6 });
  const bezel = new THREE.MeshStandardMaterial({ color: 0x0c0e10, metalness: 0.4, roughness: 0.7 });

  // Main instrument panel — an angled face the pilot reads.
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 0.08), panel);
  face.position.set(0, -0.06, -2.5);
  face.rotation.x = -0.32;            // tilt the top toward the pilot
  g.add(face);

  // Glareshield / coaming hood over the panel.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), dark);
  hood.position.set(0, 0.3, -2.16);
  hood.rotation.x = 0.25;
  g.add(hood);

  // Lower panel + knee panels.
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.1), dark);
  lower.position.set(0, -0.5, -2.25);
  lower.rotation.x = -0.7;
  g.add(lower);

  // Three MFD screens on the panel face (attitude centre, nav on the sides).
  const mfdW = 0.42, mfdH = 0.36;
  const screens = [];
  const place = (mesh, x) => {
    // bezel behind the screen
    const b = new THREE.Mesh(new THREE.BoxGeometry(mfdW + 0.06, mfdH + 0.06, 0.03), bezel);
    b.position.set(x, 0.02, -2.41); b.rotation.x = -0.32; g.add(b);
    mesh.position.set(x, 0.025, -2.4); mesh.rotation.x = -0.32; g.add(mesh); screens.push(mesh);
  };
  place(screen(navTexture('#39ff9a'), mfdW, mfdH), -0.5);
  place(screen(attitudeTexture(), mfdW, mfdH), 0.0);
  place(screen(navTexture('#5fd0ff'), mfdW, mfdH), 0.5);

  // Round standby gauges flanking the MFDs.
  for (const gx of [-0.66, 0.66]) {
    const gg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16), bezel);
    gg.rotation.x = Math.PI / 2 - 0.32; gg.position.set(gx, 0.05, -2.42); g.add(gg);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), new THREE.MeshBasicMaterial({ color: 0x0a1a14, toneMapped: false }));
    dial.position.set(gx, 0.05, -2.404); dial.rotation.x = -0.32; g.add(dial);
  }

  // Centre pedestal + throttle levers between the seats.
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.7), trim);
  ped.position.set(0, -0.5, -1.75); g.add(ped);
  for (const lx of [-0.05, 0.05]) {
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), bezel);
    lever.position.set(lx, -0.32, -1.62); lever.rotation.x = -0.5; g.add(lever);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.6 }));
    knob.position.set(lx, -0.24, -1.69); g.add(knob);
  }

  // Side consoles.
  for (const sx of [-1, 1]) {
    const con = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 1.0), dark);
    con.position.set(sx * 0.78, -0.5, -1.9); con.rotation.z = sx * 0.18; g.add(con);
  }

  // Control stick (centre).
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.34, 8), bezel);
  stick.position.set(0, -0.5, -1.35); g.add(stick);
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5 }));
  grip.position.set(0, -0.33, -1.35); g.add(grip);

  g.userData.screens = screens;
  g.visible = false;
  return g;
}
