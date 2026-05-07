// Example HITL producer.
//
// Imitates an external simulator / FPGA / LabVIEW VI that owns the flight
// physics and wants to use this browser sim purely as a 3D viewer.
// Run while the bridge is up:
//
//     npm run bridge          # in one terminal
//     node examples/hitl-producer.mjs   # in another
//     # browser: open http://localhost:8765, press H to engage HITL
//
// The aircraft will start flying a simple climbing-circle pattern driven
// from this Node script — completely bypassing the browser physics.

const URL = process.env.HITL_URL || 'http://localhost:8765/hitl/state';
const RATE_HZ = 50;
const PERIOD_MS = 1000 / RATE_HZ;

// Pattern: climbing circle of radius 600m, climb rate 4 m/s, ground speed 50.
const CIRCLE_R = 600;
const CLIMB_RATE = 4;
const SPEED = 50;
const ANG_RATE = SPEED / CIRCLE_R;          // rad/s
const START_Z = 950;                         // matches sim spawn

const tStart = Date.now();

async function tick() {
  const t = (Date.now() - tStart) / 1000;
  const ang = -Math.PI / 2 + ANG_RATE * t;   // start heading north(-Z), turn right

  const x = Math.cos(ang) * CIRCLE_R;
  const z = START_Z - CIRCLE_R + Math.sin(ang) * CIRCLE_R;
  const y = 0.8 + Math.min(300, CLIMB_RATE * t);

  // Velocity tangent to circle.
  const vx = -Math.sin(ang) * SPEED;
  const vz =  Math.cos(ang) * SPEED;
  const vy = (y < 300 ? CLIMB_RATE : 0);

  // Heading from velocity in sim convention (0 = -Z = "north"). Use Euler
  // YXZ; bank the aircraft into the turn.
  const yawRad   = Math.atan2(vx, -vz);
  const bankRad  = -25 * Math.PI / 180;     // 25° right bank for the turn
  const pitchRad =  3 * Math.PI / 180;

  const payload = {
    t: Date.now(),
    x, y, z,
    vx, vy, vz,
    yawRad, pitchRad, rollRad: bankRad,
    speed: SPEED, altitude: y,
    throttle01: 0.7,
    vsi: vy,
  };

  try {
    await fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    process.stdout.write(`\r[hitl-producer] bridge unreachable: ${e.message}        `);
  }
}

console.log(`[hitl-producer] streaming to ${URL} at ${RATE_HZ} Hz`);
console.log('  In the browser press H to engage HITL mode (mesh follows this script).');
console.log('  Ctrl+C to stop.');
setInterval(tick, PERIOD_MS);
