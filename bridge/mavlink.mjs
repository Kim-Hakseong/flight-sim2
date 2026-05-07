// MAVLink v1 encoder — minimal subset to talk to QGroundControl.
// Pure JS, no external deps.
//
// Packet layout (MAVLink v1):
//   STX(0xFE) | LEN | SEQ | SYS | COMP | MSG_ID | PAYLOAD... | CRC_LO | CRC_HI
//
// CRC is CRC-16/MCRF4XX over [LEN..end of payload, crc_extra]. crc_extra is
// a per-message byte derived from the message definition (locks parsers to the
// exact field layout — different parsers reject mismatched messages).
//
// Field order: MAVLink v1 reorders message fields by descending native size,
// keeping original order within equal-size groups. We do that reordering
// manually inside each encode* function below.

const STX_V1 = 0xFE;

/** CRC-16/MCRF4XX. init=0xFFFF, no xorout. Same as MAVLink "X.25" CRC. */
export function crc16(bytes) {
  let crc = 0xFFFF;
  for (let i = 0; i < bytes.length; i++) {
    let tmp = (bytes[i] ^ (crc & 0xFF)) & 0xFF;
    tmp = (tmp ^ (tmp << 4)) & 0xFF;
    crc = (((crc >>> 8) & 0xFF) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >>> 4)) & 0xFFFF;
  }
  return crc;
}

let _seq = 0;
function nextSeq() { const s = _seq; _seq = (_seq + 1) & 0xFF; return s; }

export function encodePacket({ msgId, payload, crcExtra, sys = 1, comp = 1, seq }) {
  if (seq === undefined) seq = nextSeq();
  const len = payload.length;
  const out = new Uint8Array(8 + len);
  out[0] = STX_V1;
  out[1] = len;
  out[2] = seq;
  out[3] = sys;
  out[4] = comp;
  out[5] = msgId;
  out.set(payload, 6);

  // CRC over header(without STX) + payload + crc_extra.
  const crcInput = new Uint8Array(5 + len + 1);
  crcInput.set(out.subarray(1, 6), 0);
  crcInput.set(payload, 5);
  crcInput[5 + len] = crcExtra;
  const c = crc16(crcInput);
  out[6 + len] = c & 0xFF;
  out[7 + len] = (c >> 8) & 0xFF;
  return out;
}

function makePayload(length, fillFn) {
  const buf = new Uint8Array(length);
  const dv = new DataView(buf.buffer);
  fillFn(dv);
  return buf;
}

// ---- HEARTBEAT (id=0, len=9, crc_extra=50) ----
// Reordered: custom_mode(u32), type(u8), autopilot(u8), base_mode(u8),
//            system_status(u8), mavlink_version(u8)
export function encodeHeartbeat({
  type = 1,            // MAV_TYPE_FIXED_WING
  autopilot = 8,       // MAV_AUTOPILOT_INVALID (generic)
  baseMode = 0,
  customMode = 0,
  systemStatus = 4,    // MAV_STATE_ACTIVE
  sys, comp, seq,
} = {}) {
  const payload = makePayload(9, dv => {
    dv.setUint32(0, customMode >>> 0, true);
    dv.setUint8(4, type);
    dv.setUint8(5, autopilot);
    dv.setUint8(6, baseMode);
    dv.setUint8(7, systemStatus);
    dv.setUint8(8, 3); // mavlink_version always 3 for v1
  });
  return encodePacket({ msgId: 0, payload, crcExtra: 50, sys, comp, seq });
}

// ---- ATTITUDE (id=30, len=28, crc_extra=39) ----
// All fields are 4 bytes → original order preserved:
// time_boot_ms(u32), roll(f32), pitch(f32), yaw(f32),
// rollspeed(f32), pitchspeed(f32), yawspeed(f32)
export function encodeAttitude({
  timeBootMs, roll, pitch, yaw, rollspeed, pitchspeed, yawspeed,
  sys, comp, seq,
}) {
  const payload = makePayload(28, dv => {
    dv.setUint32(0,  timeBootMs >>> 0, true);
    dv.setFloat32(4,  roll, true);
    dv.setFloat32(8,  pitch, true);
    dv.setFloat32(12, yaw, true);
    dv.setFloat32(16, rollspeed, true);
    dv.setFloat32(20, pitchspeed, true);
    dv.setFloat32(24, yawspeed, true);
  });
  return encodePacket({ msgId: 30, payload, crcExtra: 39, sys, comp, seq });
}

// ---- GLOBAL_POSITION_INT (id=33, len=28, crc_extra=104) ----
// Reorder happens to match declaration order:
// time_boot_ms(u32), lat(i32), lon(i32), alt(i32), relative_alt(i32),
// vx(i16), vy(i16), vz(i16), hdg(u16)
export function encodeGlobalPosition({
  timeBootMs,
  lat, lon,           // degrees
  alt, relAlt,        // meters
  vx, vy, vz,         // cm/s, NED
  hdg,                // 0..35999, centidegrees (UINT16_MAX = unknown)
  sys, comp, seq,
}) {
  const payload = makePayload(28, dv => {
    dv.setUint32(0,  timeBootMs >>> 0, true);
    dv.setInt32(4,   Math.round(lat * 1e7), true);
    dv.setInt32(8,   Math.round(lon * 1e7), true);
    dv.setInt32(12,  Math.round(alt * 1000), true);
    dv.setInt32(16,  Math.round(relAlt * 1000), true);
    dv.setInt16(20,  vx, true);
    dv.setInt16(22,  vy, true);
    dv.setInt16(24,  vz, true);
    dv.setUint16(26, hdg, true);
  });
  return encodePacket({ msgId: 33, payload, crcExtra: 104, sys, comp, seq });
}

// ---- VFR_HUD (id=74, len=20, crc_extra=20) ----
// Reordered (floats first, then heading/throttle):
// airspeed(f32), groundspeed(f32), alt(f32), climb(f32),
// heading(i16), throttle(u16)
export function encodeVfrHud({
  airspeed, groundspeed, alt, climb, heading, throttle,
  sys, comp, seq,
}) {
  const payload = makePayload(20, dv => {
    dv.setFloat32(0,  airspeed, true);
    dv.setFloat32(4,  groundspeed, true);
    dv.setFloat32(8,  alt, true);
    dv.setFloat32(12, climb, true);
    dv.setInt16(16,   heading, true);
    dv.setUint16(18,  throttle, true);
  });
  return encodePacket({ msgId: 74, payload, crcExtra: 20, sys, comp, seq });
}

// ---- PARAM_VALUE (id=22, len=25, crc_extra=220) ----
// Reordered: param_value(f32), param_count(u16), param_index(u16),
//            param_id(char[16]), param_type(u8)
export function encodeParamValue({
  paramId, paramValue, paramType = 9 /* REAL32 */, paramCount, paramIndex,
  sys, comp, seq,
}) {
  const payload = makePayload(25, dv => {
    dv.setFloat32(0, paramValue, true);
    dv.setUint16(4, paramCount, true);
    dv.setUint16(6, paramIndex, true);
    const id = String(paramId).slice(0, 16);
    for (let i = 0; i < 16; i++) {
      dv.setUint8(8 + i, i < id.length ? id.charCodeAt(i) & 0x7F : 0);
    }
    dv.setUint8(24, paramType);
  });
  return encodePacket({ msgId: 22, payload, crcExtra: 220, sys, comp, seq });
}

// ---- MISSION_COUNT (id=44, len=4, crc_extra=221) ----
// Reordered: count(u16), target_system(u8), target_component(u8)
export function encodeMissionCount({
  targetSystem, targetComponent, count,
  sys, comp, seq,
}) {
  const payload = makePayload(4, dv => {
    dv.setUint16(0, count, true);
    dv.setUint8(2, targetSystem);
    dv.setUint8(3, targetComponent);
  });
  return encodePacket({ msgId: 44, payload, crcExtra: 221, sys, comp, seq });
}

// ---- COMMAND_ACK (id=77, len=3, crc_extra=143) ----
// Layout: command(u16), result(u8)
export function encodeCommandAck({
  command, result,
  sys, comp, seq,
}) {
  const payload = makePayload(3, dv => {
    dv.setUint16(0, command, true);
    dv.setUint8(2, result);
  });
  return encodePacket({ msgId: 77, payload, crcExtra: 143, sys, comp, seq });
}

// ---- AUTOPILOT_VERSION (id=148, len=60, crc_extra=178) ----
// Reordered: capabilities(u64), uid(u64),
//   flight_sw_version(u32), middleware_sw_version(u32), os_sw_version(u32), board_version(u32),
//   vendor_id(u16), product_id(u16),
//   flight_custom_version(u8[8]), middleware_custom_version(u8[8]), os_custom_version(u8[8])
export function encodeAutopilotVersion({
  capabilities = 0n, uid = 0n,
  flightSwVersion = 0, middlewareSwVersion = 0, osSwVersion = 0, boardVersion = 0,
  vendorId = 0, productId = 0,
  sys, comp, seq,
}) {
  const payload = makePayload(60, dv => {
    dv.setBigUint64(0, BigInt(capabilities), true);
    dv.setBigUint64(8, BigInt(uid), true);
    dv.setUint32(16, flightSwVersion >>> 0, true);
    dv.setUint32(20, middlewareSwVersion >>> 0, true);
    dv.setUint32(24, osSwVersion >>> 0, true);
    dv.setUint32(28, boardVersion >>> 0, true);
    dv.setUint16(32, vendorId, true);
    dv.setUint16(34, productId, true);
    // 24 bytes of custom-version arrays remain zeroed.
  });
  return encodePacket({ msgId: 148, payload, crcExtra: 178, sys, comp, seq });
}

// ---- HOME_POSITION (id=242, len=52, crc_extra=104) ----
// All fields are 4 bytes wide; declaration order preserved:
//   lat(i32), lon(i32), alt(i32),
//   x(f32), y(f32), z(f32),
//   q[4](f32 each),
//   approach_x(f32), approach_y(f32), approach_z(f32)
export function encodeHomePosition({
  lat, lon, alt,
  x = 0, y = 0, z = 0,
  q = [1, 0, 0, 0],
  approachX = 0, approachY = 0, approachZ = 0,
  sys, comp, seq,
}) {
  const payload = makePayload(52, dv => {
    dv.setInt32(0,  Math.round(lat * 1e7), true);
    dv.setInt32(4,  Math.round(lon * 1e7), true);
    dv.setInt32(8,  Math.round(alt * 1000), true);
    dv.setFloat32(12, x, true);
    dv.setFloat32(16, y, true);
    dv.setFloat32(20, z, true);
    dv.setFloat32(24, q[0] || 0, true);
    dv.setFloat32(28, q[1] || 0, true);
    dv.setFloat32(32, q[2] || 0, true);
    dv.setFloat32(36, q[3] || 0, true);
    dv.setFloat32(40, approachX, true);
    dv.setFloat32(44, approachY, true);
    dv.setFloat32(48, approachZ, true);
  });
  return encodePacket({ msgId: 242, payload, crcExtra: 104, sys, comp, seq });
}

// ---- MISSION_REQUEST_INT (id=51, len=4, crc_extra=196) ----
// v1 truncated layout: seq(u16), target_system(u8), target_component(u8)
export function encodeMissionRequestInt({
  targetSystem, targetComponent, seq: missionSeq,
  sys, comp, seq,
}) {
  const payload = makePayload(4, dv => {
    dv.setUint16(0, missionSeq, true);
    dv.setUint8(2, targetSystem);
    dv.setUint8(3, targetComponent);
  });
  return encodePacket({ msgId: 51, payload, crcExtra: 196, sys, comp, seq });
}

// ---- MISSION_ACK (id=47, len=3, crc_extra=153) ----
// Layout: target_system(u8), target_component(u8), type(u8)
export function encodeMissionAck({
  targetSystem, targetComponent, type = 0 /* ACCEPTED */,
  sys, comp, seq,
}) {
  const payload = makePayload(3, dv => {
    dv.setUint8(0, targetSystem);
    dv.setUint8(1, targetComponent);
    dv.setUint8(2, type);
  });
  return encodePacket({ msgId: 47, payload, crcExtra: 153, sys, comp, seq });
}

// ---- MISSION_CURRENT (id=42, len=2, crc_extra=28) ----
export function encodeMissionCurrent({ seq: missionSeq, sys, comp, seq }) {
  const payload = makePayload(2, dv => dv.setUint16(0, missionSeq, true));
  return encodePacket({ msgId: 42, payload, crcExtra: 28, sys, comp, seq });
}

// ---- MISSION_ITEM_REACHED (id=46, len=2, crc_extra=11) ----
export function encodeMissionItemReached({ seq: missionSeq, sys, comp, seq }) {
  const payload = makePayload(2, dv => dv.setUint16(0, missionSeq, true));
  return encodePacket({ msgId: 46, payload, crcExtra: 11, sys, comp, seq });
}

// ---- Decoders for incoming mission/command packets ----

export function decodeMissionCount(payload) {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    count: dv.getUint16(0, true),
    target_system: payload[2],
    target_component: payload[3],
  };
}

// MISSION_ITEM_INT v1 (37 bytes), reordered:
//   param1..4 (f32 each), x (i32, lat*1e7), y (i32, lon*1e7), z (f32, alt),
//   seq (u16), command (u16),
//   target_system (u8), target_component (u8), frame (u8), current (u8), autocontinue (u8)
export function decodeMissionItemInt(payload) {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    param1: dv.getFloat32(0, true),
    param2: dv.getFloat32(4, true),
    param3: dv.getFloat32(8, true),
    param4: dv.getFloat32(12, true),
    lat: dv.getInt32(16, true) / 1e7,
    lon: dv.getInt32(20, true) / 1e7,
    alt: dv.getFloat32(24, true),
    seq: dv.getUint16(28, true),
    command: dv.getUint16(30, true),
    target_system: payload[32],
    target_component: payload[33],
    frame: payload[34],
    current: payload[35],
    autocontinue: payload[36],
  };
}

// COMMAND_LONG (31 bytes): param1..7 (f32), command (u16), target_sys, target_comp, confirmation
export function decodeCommandLong(payload) {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const params = [];
  for (let i = 0; i < 7; i++) params.push(dv.getFloat32(i * 4, true));
  return {
    params,
    command: dv.getUint16(28, true),
    target_system: payload[30] !== undefined ? payload[30] : 0, // legacy align
    target_component: payload[31] !== undefined ? payload[31] : 0,
    confirmation: payload[32] !== undefined ? payload[32] : 0,
  };
}

// ---- Decoder ----
//
// Returns an array of { version: 1|2, msgId, sys, comp, seq, payload } parsed
// from a buffer that may contain one or more MAVLink frames. v2 frames are
// recognized just enough to skip past them so v1 frames in the same buffer
// still decode. CRC is NOT verified here — we trust the link.
export function decode(buffer) {
  const out = [];
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let i = 0;
  while (i < buf.length) {
    const stx = buf[i];
    if (stx === 0xFE) {
      // V1: STX(1) LEN(1) SEQ(1) SYS(1) COMP(1) MSG(1) PAYLOAD(LEN) CRC(2)
      if (buf.length - i < 8) break;
      const len = buf[i + 1];
      const total = 8 + len;
      if (buf.length - i < total) break;
      const seq = buf[i + 2];
      const sys = buf[i + 3];
      const comp = buf[i + 4];
      const msgId = buf[i + 5];
      const payload = buf.subarray(i + 6, i + 6 + len);
      out.push({ version: 1, msgId, sys, comp, seq, payload });
      i += total;
      continue;
    }
    if (stx === 0xFD) {
      // V2: STX LEN INC_FLAGS CMP_FLAGS SEQ SYS COMP MSG_ID(3) PAYLOAD(LEN) CRC(2) [SIG(13)]
      if (buf.length - i < 12) break;
      const len = buf[i + 1];
      const incFlags = buf[i + 2];
      const sigLen = (incFlags & 1) ? 13 : 0;
      const total = 12 + len + sigLen;
      if (buf.length - i < total) break;
      // Skip — don't expose v2 frames through this decoder yet.
      i += total;
      continue;
    }
    // Resync.
    i++;
  }
  return out;
}

// ---- GPS_RAW_INT (id=24, len=30, crc_extra=24) ----
// Reordered by descending size:
// time_usec(u64), lat(i32), lon(i32), alt(i32),
// eph(u16), epv(u16), vel(u16), cog(u16),
// fix_type(u8), satellites_visible(u8)
export function encodeGpsRaw({
  timeUsec,                 // BigInt, microseconds
  lat, lon, alt,
  eph = 100, epv = 100,     // hdop/vdop * 100 (1.00 m)
  vel,                      // ground speed cm/s
  cog,                      // course over ground centidegrees
  fixType = 3,              // 3D fix
  satellitesVisible = 12,
  sys, comp, seq,
}) {
  const payload = makePayload(30, dv => {
    dv.setBigUint64(0, BigInt(timeUsec), true);
    dv.setInt32(8,   Math.round(lat * 1e7), true);
    dv.setInt32(12,  Math.round(lon * 1e7), true);
    dv.setInt32(16,  Math.round(alt * 1000), true);
    dv.setUint16(20, eph, true);
    dv.setUint16(22, epv, true);
    dv.setUint16(24, vel, true);
    dv.setUint16(26, cog, true);
    dv.setUint8(28,  fixType);
    dv.setUint8(29,  satellitesVisible);
  });
  return encodePacket({ msgId: 24, payload, crcExtra: 24, sys, comp, seq });
}
