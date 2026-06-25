// Parameter store (M4): the shared table the GCS reads (PARAM_REQUEST_LIST) and
// tunes (PARAM_SET). Clamping and unknown-id handling must be deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARAM_DEFS, paramCount, getParam, setParam, listParams,
  getParamByIndex, getParamEntry, getOverrides,
} from '../src/params.js';

test('listParams is stable, indexed, and matches paramCount', () => {
  const list = listParams();
  assert.equal(list.length, paramCount());
  list.forEach((p, i) => { assert.equal(p.index, i); assert.equal(p.id, PARAM_DEFS[i].id); });
});

test('every param_id fits MAVLink char[16]', () => {
  for (const d of PARAM_DEFS) assert.ok(d.id.length <= 16, `${d.id} too long`);
});

test('defaults are the declared defaults', () => {
  for (const d of PARAM_DEFS) assert.equal(getParam(d.id), d.def);
});

test('setParam clamps to [min,max] and returns the applied value', () => {
  assert.equal(setParam('AP_MAXBANK', 999), 45);   // max
  assert.equal(setParam('AP_MAXBANK', -10), 5);    // min
  assert.equal(setParam('AP_MAXBANK', 25), 25);    // in range → restore default
});

test('setParam rejects unknown ids and non-finite values', () => {
  assert.equal(setParam('NOPE', 1), null);
  assert.equal(setParam('AP_PITCH_KP', NaN), null);
  assert.equal(setParam('AP_PITCH_KP', Infinity), null);
});

test('getParamByIndex / getParamEntry resolve the same entry', () => {
  const byIdx = getParamByIndex(0);
  const byId = getParamEntry(byIdx.id);
  assert.deepEqual(byIdx, byId);
  assert.equal(getParamByIndex(999), null);
  assert.equal(getParamEntry('NOPE'), null);
});

test('getOverrides lists only non-default values', () => {
  assert.deepEqual(getOverrides(), []);             // all at default
  setParam('AP_PITCH_KP', 2.0);
  assert.deepEqual(getOverrides(), [{ id: 'AP_PITCH_KP', value: 2.0 }]);
  setParam('AP_PITCH_KP', 1.0);                     // restore default
  assert.deepEqual(getOverrides(), []);
});
