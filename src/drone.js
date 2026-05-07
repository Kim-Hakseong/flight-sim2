// Quadcopter (multicopter) — physics + procedural mesh.
//
// The fixed-wing model in physics.js leans on aerodynamic lift; that doesn't
// apply here. A multicopter generates lift from rotor thrust along its body
// +Y, so:
//   - no airspeed-dependent lift
//   - tilting forward makes thrust push forward (and reduces vertical lift,
//     so altitude bleeds slightly when accelerating)
//   - high thrust authority + agile attitude rate makes them feel snappy
//
// We expose tickDrone() that takes the same sim state object as the plane
// path and integrates one step.

const THREE = window.THREE;

export const DRONE = {
  mass: 2.0,             // kg — small quad
  hoverThrust: 2.0 * 9.81, // matches gravity for stable hover at 50% throttle
  maxThrust: 4.0 * 9.81, // 2x weight
  pitchRate: 3.0,
  rollRate:  3.5,
  yawRate:   2.5,
  pitchDamp: 4.0,
  rollDamp:  4.5,
  yawDamp:   3.0,
  drag:      0.18,        // body drag coefficient (per (m/s) of velocity)
};

const _bodyUp = new THREE.Vector3();
const _accel  = new THREE.Vector3();

export function stepDrone(sim, controls, dt, GRAVITY) {
  // Angular velocity targets — drones are very direct about attitude rate.
  const tx =  controls.pitch * DRONE.pitchRate;
  const ty =  controls.yaw   * DRONE.yawRate;
  const tz = -controls.roll  * DRONE.rollRate;

  sim.omega.x += (tx - sim.omega.x) * Math.min(1, dt * 8);
  sim.omega.y += (ty - sim.omega.y) * Math.min(1, dt * 8);
  sim.omega.z += (tz - sim.omega.z) * Math.min(1, dt * 8);

  if (controls.pitch === 0) sim.omega.x *= Math.exp(-DRONE.pitchDamp * dt);
  if (controls.yaw   === 0) sim.omega.y *= Math.exp(-DRONE.yawDamp   * dt);
  if (controls.roll  === 0) sim.omega.z *= Math.exp(-DRONE.rollDamp  * dt);

  // Integrate orientation (same q' = 0.5 q ⊗ ω as plane).
  const w = sim.omega;
  const wq = new THREE.Quaternion(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 1);
  sim.orientation.multiply(wq).normalize();

  // Thrust along body +Y. Throttle 0..1 → 0..max.
  _bodyUp.set(0, 1, 0).applyQuaternion(sim.orientation);
  const thrust = DRONE.maxThrust * controls.throttle;
  _accel.copy(_bodyUp).multiplyScalar(thrust / DRONE.mass);
  // Gravity.
  _accel.y -= GRAVITY;
  // Body drag (simple linear).
  _accel.x -= sim.velocity.x * DRONE.drag;
  _accel.y -= sim.velocity.y * DRONE.drag;
  _accel.z -= sim.velocity.z * DRONE.drag;

  sim.velocity.addScaledVector(_accel, dt);
  sim.position.addScaledVector(sim.velocity, dt);

  // Ground.
  const groundY = 0.4;
  if (sim.position.y < groundY) {
    sim.position.y = groundY;
    if (sim.velocity.y < 0) sim.velocity.y = 0;
    sim.velocity.x *= Math.exp(-3.0 * dt);
    sim.velocity.z *= Math.exp(-3.0 * dt);
    sim.omega.set(0, 0, 0);
  }
}

// ---------- Mesh ----------

export function buildDrone() {
  const g = new THREE.Group();
  g.name = 'drone';

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x202428 });
  const armMat  = new THREE.MeshLambertMaterial({ color: 0x383c40 });
  const propMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const ledMat  = new THREE.MeshBasicMaterial({ color: 0x44ff66 });
  const ledMatR = new THREE.MeshBasicMaterial({ color: 0xff3030 });

  // Central body.
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.55), bodyMat);
  g.add(core);

  // Camera bump on the front (visual cue for "front").
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bodyMat);
  cam.position.set(0, 0, -0.3);
  g.add(cam);

  // 4 arms in an X (NE/NW/SE/SW).
  const armLen = 0.55;
  const armGeo = new THREE.BoxGeometry(0.06, 0.06, armLen);
  const corners = [
    { x:  1, z:  1, led: ledMatR },
    { x: -1, z:  1, led: ledMatR },
    { x:  1, z: -1, led: ledMat },
    { x: -1, z: -1, led: ledMat },
  ];
  const props = [];
  for (const c of corners) {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(c.x * armLen * 0.5, 0, c.z * armLen * 0.5);
    arm.lookAt(0, 0, 0);
    g.add(arm);

    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), bodyMat);
    motor.position.set(c.x * armLen, 0.06, c.z * armLen);
    g.add(motor);

    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.012, 0.05), propMat);
    prop.position.set(c.x * armLen, 0.13, c.z * armLen);
    g.add(prop);
    props.push(prop);

    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), c.led);
    led.position.set(c.x * armLen * 1.05, -0.05, c.z * armLen * 1.05);
    g.add(led);
  }

  // Skids.
  const skid = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.6), armMat);
  skid.position.set(0.15, -0.18, 0);
  g.add(skid);
  const skid2 = skid.clone(); skid2.position.x = -0.15; g.add(skid2);

  g.userData.props = props;
  g.userData.gearOffset = 0.4; // body sits 0.4 above ground when landed
  return g;
}

export function spinDroneProps(droneMesh, dt, throttle) {
  if (!droneMesh.userData.props) return;
  const rate = 30 + throttle * 90;
  for (let i = 0; i < droneMesh.userData.props.length; i++) {
    const p = droneMesh.userData.props[i];
    // Alternate spin direction so visually they look like a real X-frame.
    p.rotation.y += dt * rate * (i % 2 === 0 ? 1 : -1);
  }
}
