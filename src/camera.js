// Camera modes: chase / external (orbit-style snapshot).
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.
//
// Chase uses a SMOOTHED pose (position lerp + orientation slerp) so the view
// low-passes the airframe's high-frequency micro-oscillation — otherwise the
// rigid 1:1 mount makes the view jitter/shake unrealistically (M32).

const THREE = window.THREE;

export const CAMERA_MODES = ['chase', 'external'];

const CHASE_OFFSET = new THREE.Vector3(0, 2.5, 9);     // behind & above (body frame)

const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpMat = new THREE.Matrix4();
const _ahead = new THREE.Vector3();
const _up = new THREE.Vector3();
const UP_WORLD = new THREE.Vector3(0, 1, 0);

export function createCameraRig() {
  return { mode: 'chase', externalAngle: 0, pos: null, quat: null, lastMode: null };
}

export function nextMode(rig) {
  const i = CAMERA_MODES.indexOf(rig.mode);
  rig.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
  return rig.mode;
}

// Frame-rate-independent smoothing factor for a given time-constant rate.
function smoothK(dt, rate) { return 1 - Math.exp(-dt * rate); }

// Apply a smoothed pose to the camera; snaps on a mode change so there's no swoop.
function applyPose(camera, rig, targetPos, targetQuat, dt, posRate, rotRate) {
  const snap = rig.lastMode !== rig.mode || !rig.pos;
  if (snap) {
    rig.pos = targetPos.clone();
    rig.quat = targetQuat.clone();
    rig.lastMode = rig.mode;
  } else {
    rig.pos.lerp(targetPos, smoothK(dt, posRate));
    rig.quat.slerp(targetQuat, smoothK(dt, rotRate));
  }
  camera.position.copy(rig.pos);
  camera.quaternion.copy(rig.quat);
}

// Build a look-at orientation (camera -Z toward target, +Y ~ up).
function lookQuat(eye, target, up, out) {
  _tmpMat.lookAt(eye, target, up);
  return out.setFromRotationMatrix(_tmpMat);
}

export function updateCamera(camera, aircraft, rig, dt) {
  if (rig.mode === 'external') {
    rig.lastMode = rig.mode; rig.pos = null; rig.quat = null; // external doesn't smooth
    rig.externalAngle += dt * 0.3;
    const r = 18;
    const a = aircraft.position;
    camera.position.set(a.x + Math.cos(rig.externalAngle) * r, a.y + 4, a.z + Math.sin(rig.externalAngle) * r);
    camera.up.set(0, 1, 0);
    camera.lookAt(a.x, a.y, a.z);
    return;
  }

  // chase: behind & above, looking just ahead of the nose; world-up stabilised.
  aircraft.localToWorld(_tmpPos.copy(CHASE_OFFSET));
  _ahead.set(0, 0.5, -10); aircraft.localToWorld(_ahead);
  _up.set(0, 1, 0).applyQuaternion(aircraft.getWorldQuaternion(_tmpQuat));
  // Blend the body-up toward world-up so the chase view doesn't roll fully with the
  // aircraft (more stable, less nauseating than a rigid mount).
  _up.lerp(UP_WORLD, 0.5).normalize();
  const q = lookQuat(_tmpPos, _ahead, _up, _tmpQuat);
  applyPose(camera, rig, _tmpPos, q, dt, 6, 7);
}
