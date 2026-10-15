import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDemoCommand, checkDigit, forceIncident, makeUnit, randomContainerNo, stepDemoUnit } from './demo-fleet';

test('ISO 6346 check digit', () => {
  assert.equal(checkDigit('CSQU305438'), 3); // the standard's own example
  assert.equal(checkDigit('TRLU876543'), 6);
});

test('random container numbers are valid and unique', () => {
  const taken = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const no = randomContainerNo(taken);
    assert.match(no, /^[A-Z]{3}U\d{7}$/);
    assert.equal(Number(no[10]), checkDigit(no.slice(0, 10)));
    assert.ok(!taken.has(no));
    taken.add(no);
  }
});

test('a forced incident is visible and ends on time', () => {
  const u = makeUnit('TESTU0000000', -18);
  const t0 = Date.now();
  forceIncident(u, t0);
  assert.ok(u.ev.faultUntil || u.ev.heatUntil);
  const until = (u.ev.faultUntil ?? u.ev.heatUntil)!;
  // Past its end the incident is cleared (a new random one may start, but never with the same end time).
  stepDemoUnit(u, until + 1, 5_000);
  assert.notEqual(u.ev.faultUntil, until);
  assert.notEqual(u.ev.heatUntil, until);
});

test('silent gateway sends nothing; commands override a power cut', () => {
  const u = makeUnit('TESTU0000001', 2);
  const now = Date.now();
  u.ev.silentUntil = now + 60_000;
  assert.equal(stepDemoUnit(u, now, 5_000), null);
  u.ev = { offUntil: now + 60_000 };
  u.power = 0;
  applyDemoCommand(u, { power: 'on' });
  assert.equal(u.power, 1);
  assert.equal(u.ev.offUntil, undefined);
});
