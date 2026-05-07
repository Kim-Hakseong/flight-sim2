// Telemetry recorder: ring buffer + CSV export + chronological retrieval.
// All pure data — no DOM, no Three.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRecorder,
  startRecording,
  stopRecording,
  recordSnapshot,
  getSnapshots,
  toCSV,
  findAt,
  isRecording,
  isReplaying,
  beginReplay,
  endReplay,
  clear,
} from '../src/recorder.js';

const sample = (t, x = 0, y = 0, z = 0) => ({ t, x, y, z, throttle: 0.5 });

test('createRecorder: empty + not recording + not replaying', () => {
  const r = createRecorder({ capacity: 4 });
  assert.equal(r.capacity, 4);
  assert.equal(getSnapshots(r).length, 0);
  assert.equal(isRecording(r), false);
  assert.equal(isReplaying(r), false);
});

test('record: only stores when recording is on', () => {
  const r = createRecorder({ capacity: 4 });
  recordSnapshot(r, sample(1));
  assert.equal(getSnapshots(r).length, 0, 'should ignore until startRecording');
  startRecording(r);
  recordSnapshot(r, sample(2));
  recordSnapshot(r, sample(3));
  assert.equal(getSnapshots(r).length, 2);
});

test('record: ring buffer wraps when capacity exceeded, returns chronological order', () => {
  const r = createRecorder({ capacity: 3 });
  startRecording(r);
  recordSnapshot(r, sample(1));
  recordSnapshot(r, sample(2));
  recordSnapshot(r, sample(3));
  recordSnapshot(r, sample(4));
  recordSnapshot(r, sample(5));
  const snaps = getSnapshots(r);
  assert.equal(snaps.length, 3);
  assert.deepEqual(snaps.map(s => s.t), [3, 4, 5]);
});

test('stopRecording: subsequent samples are dropped', () => {
  const r = createRecorder({ capacity: 4 });
  startRecording(r);
  recordSnapshot(r, sample(1));
  stopRecording(r);
  recordSnapshot(r, sample(2));
  assert.deepEqual(getSnapshots(r).map(s => s.t), [1]);
});

test('toCSV: header from keys, rows with primitive values', () => {
  const r = createRecorder({ capacity: 4 });
  startRecording(r);
  recordSnapshot(r, sample(1, 10, 20, 30));
  recordSnapshot(r, sample(2, 11, 21, 31));
  const csv = toCSV(r);
  const [header, row1, row2] = csv.split('\n');
  assert.ok(header.includes('t'));
  assert.ok(header.includes('x'));
  assert.ok(header.includes('throttle'));
  // Numbers are formatted with 4 decimals by default.
  assert.ok(row1.includes('10.0000'));
  assert.ok(row2.includes('11.0000'));
});

test('findAt: returns snapshot bracketing the requested time', () => {
  const r = createRecorder({ capacity: 8 });
  startRecording(r);
  for (let t = 0; t < 5; t++) recordSnapshot(r, sample(t * 100, t, 0, 0));
  // t=100..400; ask for t=250 → should land at the snap with t<=250 (i.e. t=200)
  const got = findAt(r, 250);
  assert.equal(got.t, 200);
});

test('findAt: clamps to first/last for out-of-range queries', () => {
  const r = createRecorder({ capacity: 4 });
  startRecording(r);
  recordSnapshot(r, sample(100));
  recordSnapshot(r, sample(200));
  recordSnapshot(r, sample(300));
  assert.equal(findAt(r, 0).t,    100);
  assert.equal(findAt(r, 9999).t, 300);
});

test('beginReplay/endReplay: toggles flag, mutually exclusive with recording', () => {
  const r = createRecorder({ capacity: 4 });
  startRecording(r);
  recordSnapshot(r, sample(1));
  beginReplay(r);
  assert.equal(isRecording(r), false);
  assert.equal(isReplaying(r), true);
  endReplay(r);
  assert.equal(isReplaying(r), false);
});

test('clear: resets buffer and counters', () => {
  const r = createRecorder({ capacity: 4 });
  startRecording(r);
  recordSnapshot(r, sample(1));
  recordSnapshot(r, sample(2));
  clear(r);
  assert.equal(getSnapshots(r).length, 0);
});
