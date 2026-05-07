// MAVLink v1 encoder tests.
// References:
//   - https://mavlink.io/en/guide/serialization.html (packet structure & CRC)
//   - common.xml message definitions for IDs, lengths, CRC_EXTRA

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  crc16,
  encodePacket,
  encodeHeartbeat,
  encodeAttitude,
  encodeGlobalPosition,
  encodeVfrHud,
  encodeGpsRaw,
  encodeParamValue,
  encodeMissionCount,
  encodeCommandAck,
  encodeAutopilotVersion,
  encodeHomePosition,
  encodeMissionRequestInt,
  encodeMissionAck,
  encodeMissionCurrent,
  encodeMissionItemReached,
  decodeMissionCount,
  decodeMissionItemInt,
  decodeCommandLong,
  decode,
} from '../bridge/mavlink.mjs';

test('crc16: standard MCRF4XX check value 0x6F91 for "123456789"', () => {
  // Standard CRC-16/MCRF4XX test vector (== MAVLink "X.25" CRC).
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc16(bytes), 0x6F91);
});

test('crc16: empty input returns init value 0xFFFF', () => {
  assert.equal(crc16(new Uint8Array([])), 0xFFFF);
});

test('encodePacket: structure (STX, LEN, SEQ, SYS, COMP, MSG, payload, CRC)', () => {
  const payload = new Uint8Array([0xAA, 0xBB]);
  const pkt = encodePacket({ msgId: 0, payload, crcExtra: 50, sys: 1, comp: 1, seq: 0 });
  assert.equal(pkt[0], 0xFE,  'STX');
  assert.equal(pkt[1], 2,     'LEN');
  assert.equal(pkt[2], 0,     'SEQ');
  assert.equal(pkt[3], 1,     'SYS');
  assert.equal(pkt[4], 1,     'COMP');
  assert.equal(pkt[5], 0,     'MSG');
  assert.equal(pkt[6], 0xAA);
  assert.equal(pkt[7], 0xBB);
  // total = 6 header + 2 payload + 2 CRC
  assert.equal(pkt.length, 10);
});

test('encodePacket: CRC includes header(no STX) + payload + crc_extra', () => {
  // Manually compute the expected CRC for a tiny known packet:
  //   header(no STX) = [LEN=1, SEQ=0, SYS=1, COMP=1, MSG=0]
  //   payload = [0x42]
  //   crc_extra = 50
  const payload = new Uint8Array([0x42]);
  const pkt = encodePacket({ msgId: 0, payload, crcExtra: 50, sys: 1, comp: 1, seq: 0 });

  const crcInput = new Uint8Array([1, 0, 1, 1, 0, 0x42, 50]);
  const expected = crc16(crcInput);
  const got = pkt[pkt.length - 2] | (pkt[pkt.length - 1] << 8);
  assert.equal(got, expected);
});

test('encodeHeartbeat: payload reorder — custom_mode(u32) first, then 1-byte fields', () => {
  const pkt = encodeHeartbeat({
    type: 1, autopilot: 8, baseMode: 0, customMode: 0, systemStatus: 4,
  });
  assert.equal(pkt[1], 9,  'LEN=9');
  assert.equal(pkt[5], 0,  'MSG=HEARTBEAT(0)');
  // payload offset = 6
  // custom_mode u32 LE (4 bytes of 0)
  assert.equal(pkt[6], 0); assert.equal(pkt[7], 0);
  assert.equal(pkt[8], 0); assert.equal(pkt[9], 0);
  // type, autopilot, base_mode, system_status, mavlink_version
  assert.equal(pkt[10], 1);  // type
  assert.equal(pkt[11], 8);  // autopilot
  assert.equal(pkt[12], 0);  // base_mode
  assert.equal(pkt[13], 4);  // system_status
  assert.equal(pkt[14], 3);  // mavlink_version (always 3)
});

test('encodeAttitude: LEN=28, MSG=30, time_boot_ms LE at payload start', () => {
  const pkt = encodeAttitude({
    timeBootMs: 0x12345678,
    roll: 0, pitch: 0, yaw: 0,
    rollspeed: 0, pitchspeed: 0, yawspeed: 0,
  });
  assert.equal(pkt[1], 28);
  assert.equal(pkt[5], 30);
  // time_boot_ms LE: 78 56 34 12
  assert.equal(pkt[6],  0x78);
  assert.equal(pkt[7],  0x56);
  assert.equal(pkt[8],  0x34);
  assert.equal(pkt[9],  0x12);
});

test('encodeAttitude: roll/pitch/yaw encoded as float32 LE', () => {
  const pkt = encodeAttitude({
    timeBootMs: 0,
    roll: 1.5, pitch: -0.25, yaw: 2.0,
    rollspeed: 0, pitchspeed: 0, yawspeed: 0,
  });
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getFloat32(6 + 4, true), 1.5);
  assert.equal(dv.getFloat32(6 + 8, true), -0.25);
  assert.equal(dv.getFloat32(6 + 12, true), 2.0);
});

test('encodeGlobalPosition: lat/lon scaled by 1e7 as int32, alt by 1e3', () => {
  const pkt = encodeGlobalPosition({
    timeBootMs: 0,
    lat: 37.5, lon: 127.0, alt: 100, relAlt: 100,
    vx: 1, vy: 2, vz: 3, hdg: 9000,
  });
  assert.equal(pkt[1], 28);
  assert.equal(pkt[5], 33);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getInt32(6 + 4,  true),  375000000);  // lat
  assert.equal(dv.getInt32(6 + 8,  true), 1270000000);  // lon
  assert.equal(dv.getInt32(6 + 12, true),     100000);  // alt mm
  assert.equal(dv.getInt32(6 + 16, true),     100000);  // rel_alt mm
  assert.equal(dv.getInt16(6 + 20, true), 1);
  assert.equal(dv.getInt16(6 + 22, true), 2);
  assert.equal(dv.getInt16(6 + 24, true), 3);
  assert.equal(dv.getUint16(6 + 26, true), 9000);
});

test('encodeVfrHud: reordered — floats first, then heading(i16), throttle(u16)', () => {
  const pkt = encodeVfrHud({
    airspeed: 50, groundspeed: 48, alt: 100, climb: 2,
    heading: 90, throttle: 75,
  });
  assert.equal(pkt[1], 20);
  assert.equal(pkt[5], 74);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getFloat32(6 + 0,  true), 50);
  assert.equal(dv.getFloat32(6 + 4,  true), 48);
  assert.equal(dv.getFloat32(6 + 8,  true), 100);
  assert.equal(dv.getFloat32(6 + 12, true), 2);
  assert.equal(dv.getInt16(6 + 16, true),  90);   // heading after the 4 floats
  assert.equal(dv.getUint16(6 + 18, true), 75);   // throttle last
});

test('encodeGpsRaw: time_usec u64, fix_type / sats at the end (after reorder)', () => {
  const pkt = encodeGpsRaw({
    timeUsec: 1_000_000n,
    lat: 37.5, lon: 127.0, alt: 100,
    vel: 4500, cog: 9000,
    fixType: 3, satellitesVisible: 12,
  });
  assert.equal(pkt[1], 30);
  assert.equal(pkt[5], 24);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getBigUint64(6, true), 1_000_000n);
  assert.equal(dv.getInt32(6 + 8,  true), 375000000);
  assert.equal(dv.getInt32(6 + 12, true), 1270000000);
  // Fix type & sats are reordered to the very end.
  assert.equal(pkt[6 + 28], 3);   // fix_type
  assert.equal(pkt[6 + 29], 12);  // satellites_visible
});

// ---------- Response encoders (M7) ----------

test('encodeParamValue: LEN=25, MSG=22, layout (value, count, index, id[16], type)', () => {
  const pkt = encodeParamValue({
    paramId: 'SIM_INFO',
    paramValue: 1.0,
    paramType: 9, // REAL32
    paramCount: 1,
    paramIndex: 0,
  });
  assert.equal(pkt[1], 25);
  assert.equal(pkt[5], 22);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getFloat32(6 + 0, true), 1.0);
  assert.equal(dv.getUint16(6 + 4, true), 1);   // count
  assert.equal(dv.getUint16(6 + 6, true), 0);   // index
  // param_id "SIM_INFO" (8 chars) at offset 8, padded with zeros to 16 bytes
  assert.equal(pkt[6 + 8],  'S'.charCodeAt(0));
  assert.equal(pkt[6 + 9],  'I'.charCodeAt(0));
  assert.equal(pkt[6 + 10], 'M'.charCodeAt(0));
  assert.equal(pkt[6 + 11], '_'.charCodeAt(0));
  assert.equal(pkt[6 + 12], 'I'.charCodeAt(0));
  assert.equal(pkt[6 + 16], 0); // null pad
  assert.equal(pkt[6 + 24], 9); // param_type at end
});

test('encodeMissionCount: LEN=4, MSG=44, layout (count, target_sys, target_comp)', () => {
  const pkt = encodeMissionCount({
    targetSystem: 255,
    targetComponent: 0,
    count: 0,
  });
  assert.equal(pkt[1], 4);
  assert.equal(pkt[5], 44);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getUint16(6 + 0, true), 0);
  assert.equal(pkt[6 + 2], 255);
  assert.equal(pkt[6 + 3], 0);
});

test('encodeCommandAck: LEN=3, MSG=77, layout (command, result)', () => {
  const pkt = encodeCommandAck({ command: 520, result: 0 });
  assert.equal(pkt[1], 3);
  assert.equal(pkt[5], 77);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getUint16(6 + 0, true), 520);
  assert.equal(pkt[6 + 2], 0);
});

test('encodeAutopilotVersion: LEN=60, MSG=148, capabilities at offset 0 then uid', () => {
  const pkt = encodeAutopilotVersion({
    capabilities: 0n,
    flightSwVersion: 0x010000ff,
    vendorId: 0xABCD,
    productId: 0x1234,
    uid: 0xDEADBEEFn,
  });
  assert.equal(pkt[1], 60);
  assert.equal(pkt[5], 148);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getBigUint64(6 + 0, true), 0n);                // capabilities
  assert.equal(dv.getBigUint64(6 + 8, true), 0xDEADBEEFn);        // uid
  assert.equal(dv.getUint32(6 + 16, true), 0x010000ff);
  assert.equal(dv.getUint16(6 + 32, true), 0xABCD);
  assert.equal(dv.getUint16(6 + 34, true), 0x1234);
});

test('encodeHomePosition: LEN=52, MSG=242, lat/lon/alt int32 + xyz floats + q[4]', () => {
  const pkt = encodeHomePosition({
    lat: 37.5, lon: 127.0, alt: 100,
    x: 0, y: 0, z: 0,
    q: [1, 0, 0, 0],
    approachX: 0, approachY: 0, approachZ: 0,
  });
  assert.equal(pkt[1], 52);
  assert.equal(pkt[5], 242);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getInt32(6 + 0,  true), 375000000);
  assert.equal(dv.getInt32(6 + 4,  true), 1270000000);
  assert.equal(dv.getInt32(6 + 8,  true), 100000); // alt mm
  // q[0] = 1 at offset 36 (lat 4, lon 4, alt 4, x 4, y 4, z 4 = 24, then q starts at offset 24)
  assert.equal(dv.getFloat32(6 + 24, true), 1.0);
});

test('decode: parses an encoded HEARTBEAT roundtrip', () => {
  const pkt = encodeHeartbeat({ type: 1, autopilot: 0, baseMode: 0, customMode: 0, systemStatus: 4, sys: 1, comp: 1, seq: 7 });
  const decoded = decode(pkt);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].msgId, 0);
  assert.equal(decoded[0].sys, 1);
  assert.equal(decoded[0].comp, 1);
  assert.equal(decoded[0].seq, 7);
  assert.equal(decoded[0].payload.length, 9);
});

test('decode: parses two concatenated v1 packets', () => {
  const a = encodeHeartbeat({ sys: 1, seq: 1 });
  const b = encodeCommandAck({ command: 100, result: 0, sys: 1, seq: 2 });
  const buf = new Uint8Array(a.length + b.length);
  buf.set(a, 0); buf.set(b, a.length);
  const decoded = decode(buf);
  assert.equal(decoded.length, 2);
  assert.equal(decoded[0].msgId, 0);
  assert.equal(decoded[1].msgId, 77);
});

test('decode: skips past a MAVLink v2 packet (STX 0xFD) without crashing', () => {
  // Synthesize a minimal v2 frame: 0xFD, len=0, inc=0, cmp=0, seq=0, sys=1, comp=1, msgId(3)=0, crc(2)
  const v2 = new Uint8Array([0xFD, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0xAA, 0xBB]);
  const v1 = encodeHeartbeat({ seq: 99 });
  const buf = new Uint8Array(v2.length + v1.length);
  buf.set(v2, 0); buf.set(v1, v2.length);
  const decoded = decode(buf);
  // Only the v1 packet is returned.
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].msgId, 0);
  assert.equal(decoded[0].seq, 99);
});

test('decode: COMMAND_LONG payload exposes command id at offset 28', () => {
  // Manually build a COMMAND_LONG payload (31 bytes): 7 floats + uint16 command + 3 u8
  const payload = new Uint8Array(31);
  const dv = new DataView(payload.buffer);
  // 7 floats stay 0
  dv.setUint16(28, 520, true); // MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES
  payload[30] = 0; // confirmation
  const pkt = encodePacket({ msgId: 76, payload, crcExtra: 152, sys: 255, comp: 0, seq: 0 });
  const decoded = decode(pkt);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].msgId, 76);
  const pdv = new DataView(decoded[0].payload.buffer, decoded[0].payload.byteOffset, decoded[0].payload.byteLength);
  assert.equal(pdv.getUint16(28, true), 520);
});

// ---------- Mission protocol (M7) ----------

test('encodeMissionRequestInt: LEN=4, MSG=51, layout (seq u16, target_sys, target_comp)', () => {
  const pkt = encodeMissionRequestInt({ targetSystem: 255, targetComponent: 0, seq: 3 });
  assert.equal(pkt[1], 4);
  assert.equal(pkt[5], 51);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getUint16(6 + 0, true), 3);
  assert.equal(pkt[6 + 2], 255);
  assert.equal(pkt[6 + 3], 0);
});

test('encodeMissionAck: LEN=3, MSG=47, layout (target_sys, target_comp, type)', () => {
  const pkt = encodeMissionAck({ targetSystem: 255, targetComponent: 0, type: 0 });
  assert.equal(pkt[1], 3);
  assert.equal(pkt[5], 47);
  assert.equal(pkt[6 + 0], 255);
  assert.equal(pkt[6 + 1], 0);
  assert.equal(pkt[6 + 2], 0);
});

test('encodeMissionCurrent: LEN=2, MSG=42, seq u16', () => {
  const pkt = encodeMissionCurrent({ seq: 5 });
  assert.equal(pkt[1], 2);
  assert.equal(pkt[5], 42);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getUint16(6, true), 5);
});

test('encodeMissionItemReached: LEN=2, MSG=46, seq u16', () => {
  const pkt = encodeMissionItemReached({ seq: 2 });
  assert.equal(pkt[1], 2);
  assert.equal(pkt[5], 46);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  assert.equal(dv.getUint16(6, true), 2);
});

test('decodeMissionCount: { count, target_system, target_component }', () => {
  const payload = new Uint8Array(4);
  const dv = new DataView(payload.buffer);
  dv.setUint16(0, 7, true);  // count
  payload[2] = 1;             // target_system
  payload[3] = 1;             // target_component
  const got = decodeMissionCount(payload);
  assert.equal(got.count, 7);
  assert.equal(got.target_system, 1);
  assert.equal(got.target_component, 1);
});

test('decodeMissionItemInt: roundtrip a synthesized item', () => {
  // MISSION_ITEM_INT v1 payload (37 bytes): param1..4(f32), x(i32), y(i32), z(f32),
  //   seq(u16), command(u16), target_sys(u8), target_comp(u8), frame(u8), current(u8), autocontinue(u8)
  const payload = new Uint8Array(37);
  const dv = new DataView(payload.buffer);
  dv.setFloat32(0,  0, true);                    // param1
  dv.setFloat32(4,  0, true);                    // param2
  dv.setFloat32(8,  0, true);                    // param3
  dv.setFloat32(12, 0, true);                    // param4
  dv.setInt32(16,   Math.round(37.5 * 1e7), true); // x = lat * 1e7
  dv.setInt32(20,   Math.round(127.0 * 1e7), true);// y = lon * 1e7
  dv.setFloat32(24, 100.0, true);                // z = alt
  dv.setUint16(28,  2, true);                    // seq
  dv.setUint16(30,  16, true);                   // command (MAV_CMD_NAV_WAYPOINT)
  payload[32] = 1;                                // target_system
  payload[33] = 1;                                // target_component
  payload[34] = 3;                                // frame (MAV_FRAME_GLOBAL_RELATIVE_ALT_INT)
  payload[35] = 0;                                // current
  payload[36] = 1;                                // autocontinue

  const got = decodeMissionItemInt(payload);
  assert.equal(got.seq, 2);
  assert.equal(got.command, 16);
  assert.equal(got.frame, 3);
  assert.equal(got.autocontinue, 1);
  assert.ok(Math.abs(got.lat - 37.5) < 1e-6);
  assert.ok(Math.abs(got.lon - 127.0) < 1e-6);
  assert.equal(got.alt, 100.0);
});

test('decodeCommandLong: extracts command id and 7 params', () => {
  const payload = new Uint8Array(31);
  const dv = new DataView(payload.buffer);
  dv.setFloat32(0,  1.5, true);
  dv.setFloat32(4,  -2.5, true);
  dv.setUint16(28,  300, true); // MAV_CMD_MISSION_START
  payload[30] = 0; // confirmation
  const got = decodeCommandLong(payload);
  assert.equal(got.command, 300);
  assert.ok(Math.abs(got.params[0] - 1.5) < 1e-6);
  assert.ok(Math.abs(got.params[1] - -2.5) < 1e-6);
});
