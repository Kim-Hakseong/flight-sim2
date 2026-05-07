// Procedural NPC traffic — purely kinematic (no physics integration). Each
// AI flies a fixed orbit at constant altitude/speed so you never see them
// crash and the cost is O(N) per frame.

const THREE = window.THREE;

const PALETTE = [0xb0c4de, 0xddaa55, 0x88aa66, 0xbb6666, 0xcccccc];

function makeMiniAircraft(color) {
  const g = new THREE.Group();
  const matBody = new THREE.MeshLambertMaterial({ color });
  const matAccent = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 12), matBody);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 12), matBody);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.1;
  g.add(nose);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 1.4), matBody);
  wing.position.y = 0.3;
  g.add(wing);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.8), matBody);
  tail.position.set(0, 0.4, 2.8);
  g.add(tail);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 1.0), matBody);
  fin.position.set(0, 0.9, 2.8);
  g.add(fin);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  );
  beacon.position.set(0, -0.6, 0);
  g.add(beacon);

  return g;
}

export function spawnTraffic(scene, count = 5) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const color = PALETTE[i % PALETTE.length];
    const mesh = makeMiniAircraft(color);
    scene.add(mesh);

    list.push({
      mesh,
      cx: (Math.random() - 0.5) * 5000,
      cz: (Math.random() - 0.5) * 5000,
      radius: 600 + Math.random() * 1400,
      alt: 200 + Math.random() * 600,
      speed: 38 + Math.random() * 32,
      angle: Math.random() * Math.PI * 2,
      // Most fly clockwise from above (angle decreasing); some CCW.
      direction: Math.random() < 0.5 ? 1 : -1,
    });
  }
  return list;
}

const _next = new THREE.Vector3();

export function tickTraffic(list, dt) {
  for (const a of list) {
    const omega = (a.speed / a.radius) * a.direction;
    a.angle += omega * dt;
    const x = a.cx + Math.cos(a.angle) * a.radius;
    const z = a.cz + Math.sin(a.angle) * a.radius;
    a.mesh.position.set(x, a.alt, z);

    // Look slightly ahead along the orbit so the nose tracks the path.
    const look = a.angle + 0.05 * a.direction;
    _next.set(
      a.cx + Math.cos(look) * a.radius,
      a.alt,
      a.cz + Math.sin(look) * a.radius,
    );
    a.mesh.lookAt(_next);
    // Bank into the turn. Three.js lookAt leaves up = world +Y; rotateZ
    // banks around body forward axis.
    a.mesh.rotateZ(-0.4 * a.direction);
  }
}
