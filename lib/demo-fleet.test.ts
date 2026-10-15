import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDemoCommand, checkDigit, forceIncident, makeUnit, randomContainerNo, startIncident, stepDemoUnit } from './demo-fleet';

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

test('scheduled incidents produce alert-worthy readings and then clear', () => {
  const now = Date.now();
  const cases: [Parameters<typeof startIncident>[1], (p: NonNullable<ReturnType<typeof stepDemoUnit>>) => boolean][] = [
    ['fault', (p) => p.faultcode > 0],
    ['setpoint', (p) => Math.abs(p.settemp - 5) >= 1],
    ['voltage', (p) => p.voltage < 360],
    ['humidity', (p) => p.humidity > 95],
    ['current', (p) => p.current > 18],
  ];
  for (const [kind, alerting] of cases) {
    const u = makeUnit('TESTU0000002', 5);
    assert.ok(startIncident(u, kind, now, 5), kind);
    assert.ok(!startIncident(u, 'fault', now, 5), `${kind}: one incident at a time`);
    const during = stepDemoUnit(u, now + 1_000, 5_000)!;
    assert.ok(alerting(during), `${kind} should trip its rule`);
    stepDemoUnit(u, now + 91_000, 5_000); // all short incidents last at most 90 s
    if (kind === 'setpoint') assert.equal(u.set, 5);
    assert.equal(u.ev.sensor, undefined);
  }
  assert.ok(!startIncident(makeUnit('TESTU0000003', 5), 'setpoint', now, null), 'set point incidents need a target');
});
