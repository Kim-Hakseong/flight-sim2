// Camera modes: chase / cockpit / external (orbit-style snapshot).
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.

const THREE = window.THREE;

export const CAMERA_MODES = ['chase', 'cockpit', 'external'];

const CHASE_OFFSET = new THREE.Vector3(0, 2.5, 9);   // behind & above (in body frame)
const COCKPIT_OFFSET = new THREE.Vector3(0, 0.55, -0.6);

const _tmpPos = new THREE.Vector3();
const _tmpLook = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();

export function createCameraRig() {
  return { mode: 'chase', externalAngle: 0 };
}

export function nextMode(rig) {
  const i = CAMERA_MODES.indexOf(rig.mode);
  rig.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
  return rig.mode;
}

export function updateCamera(camera, aircraft, rig, dt) {
  if (rig.mode === 'cockpit') {
    // Sit inside the cockpit, look forward (-Z) in body frame.
    const localTarget = new THREE.Vector3(0, 0.55, -50);
    aircraft.localToWorld(_tmpPos.copy(COCKPIT_OFFSET));
    aircraft.localToWorld(_tmpLook.copy(localTarget));
    camera.position.copy(_tmpPos);
    camera.up.set(0, 1, 0).applyQuaternion(aircraft.getWorldQuaternion(_tmpQuat));
    camera.lookAt(_tmpLook);
    return;
  }

  if (rig.mode === 'external') {
    // Slow orbit around the aircraft, fixed world-up.
    rig.externalAngle += dt * 0.3;
    const r = 18;
    const ax = aircraft.position.x;
    const ay = aircraft.position.y;
    const az = aircraft.position.z;
    camera.position.set(
      ax + Math.cos(rig.externalAngle) * r,
      ay + 4,
      az + Math.sin(rig.externalAngle) * r,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(ax, ay, az);
    return;
  }

  // chase: smooth lerp behind & above the aircraft, oriented with its body.
  aircraft.localToWorld(_tmpPos.copy(CHASE_OFFSET));
  // Lerp factor — frame-rate independent-ish.
  const k = 1 - Math.exp(-dt * 6);
  camera.position.lerp(_tmpPos, k);

  // Look slightly ahead of the nose.
  const ahead = new THREE.Vector3(0, 0.5, -10);
  aircraft.localToWorld(ahead);
  camera.up.set(0, 1, 0).applyQuaternion(aircraft.getWorldQuaternion(_tmpQuat));
  camera.lookAt(ahead);
}
