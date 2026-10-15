import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, describe, evaluate, inScope, Snapshot } from './rules';

const now = new Date('2026-10-15T10:00:00Z');
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({
  lastSeenAt: new Date('2026-10-15T09:59:00Z'),
  setTemp: -18,
  supplyTemp: -17.5,
  returnTemp: -16.8,
  humidity: 80,
  voltage: 400,
  current: 11,
  powerOn: true,
  faultCode: 0,
  targetTemp: -18,
  tolerance: 2,
  ...o,
});
const rule = (o: object) => ({ metric: 'deviation', operator: 'gt', threshold: 2, threshold2: null, durationSec: 0, severity: 'warning', ...o });

test('compare operators', () => {
  assert.equal(compare(5, 'gt', 4, null), true);
  assert.equal(compare(5, 'outside', 0, 4), true);
  assert.equal(compare(2, 'outside', 0, 4), false);
  assert.equal(compare(2, 'between', 4, 0), true);
  assert.equal(compare(null, 'lt', 0, null), false);
});

test('deviation uses the reported set point, falling back to the cargo target', () => {
  assert.equal(evaluate(rule({}), snap({ supplyTemp: -15 }), now).active, true);
  assert.equal(evaluate(rule({}), snap(), now).active, false);
  assert.equal(evaluate(rule({}), snap({ setTemp: null, supplyTemp: -14 }), now).value, 4);
});

test('per-reefer tolerance with a margin', () => {
  const r = rule({ useTolerance: true, threshold: 1 }); // tolerance 3 + 1
  assert.equal(evaluate(r, snap({ supplyTemp: -14.5, tolerance: 3 }), now).active, false);
  assert.equal(evaluate(r, snap({ supplyTemp: -13.5, tolerance: 3 }), now).active, true);
});

test('boolean and offline metrics', () => {
  assert.equal(evaluate(rule({ metric: 'fault' }), snap({ faultCode: 12 }), now).active, true);
  assert.equal(evaluate(rule({ metric: 'power_off' }), snap({ powerOn: false }), now).active, true);
  assert.equal(evaluate(rule({ metric: 'offline', threshold: 5 }), snap(), now).active, false);
  assert.equal(evaluate(rule({ metric: 'offline', threshold: 5 }), snap({ lastSeenAt: new Date('2026-10-15T09:50:00Z') }), now).active, true);
  assert.equal(evaluate(rule({ metric: 'offline', threshold: 5 }), snap({ lastSeenAt: null }), now).active, true);
  // Newly registered, never reported: silence counts from registration.
  assert.equal(evaluate(rule({ metric: 'offline', threshold: 5 }), snap({ lastSeenAt: null, createdAt: new Date('2026-10-15T09:58:00Z') }), now).active, false);
  assert.equal(evaluate(rule({ metric: 'offline', threshold: 5 }), snap({ lastSeenAt: null, createdAt: new Date('2026-10-15T09:00:00Z') }), now).active, true);
});

test('scope and description', () => {
  assert.equal(inScope('tags', '["Pharma"]', { id: 1, tags: 'pharma, fruit' }), true);
  assert.equal(inScope('reefers', '[2]', { id: 1, tags: '' }), false);
  assert.equal(describe(rule({ durationSec: 600 })), 'Warning when deviation from set point is above 2 °C for 10 min');
  assert.equal(describe(rule({ metric: 'fault', severity: 'critical' })), 'Critical when unit reports a fault code immediately');
});
