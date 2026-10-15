import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPath, mapPayload, resolveDeviceId } from './mapping';
import { DEFAULTS } from './settings-schema';

test('maps the default (yard gateway) payload', () => {
  const t = mapPayload(
    { containerNo: 'msku1234565', settemp: -18, sstemp: '-17.4', rstemp: -16.9, humidity: 80, voltage: 400, current: 11.2, coolerstate: 1, faultcode: 0, workmode: 'chill', worktime: 1200, gps: { lat: 1 } },
    'reefer/MSKU1234565/telemetry',
    DEFAULTS.mapping,
  );
  assert.equal(t.deviceId, 'MSKU1234565');
  assert.equal(t.supplyTemp, -17.4);
  assert.equal(t.powerOn, true);
  assert.equal(t.mode, 'chill');
  assert.deepEqual(t.extra, { 'gps.lat': 1 });
});

test('reads nested paths, topic device ids, epoch seconds and Fahrenheit', () => {
  const m = { ...DEFAULTS.mapping, deviceId: 'topic:1', supplyTemp: 'temps.supply', setTemp: 'temps.set', timestamp: 'ts', power: 'state', payloadFahrenheit: true };
  const t = mapPayload({ ts: 1_760_000_000, temps: { supply: 32, set: 212 }, state: 'OFF' }, 'reefer/abc-01/telemetry', m);
  assert.equal(t.deviceId, 'ABC-01');
  assert.equal(t.supplyTemp, 0);
  assert.equal(t.setTemp, 100);
  assert.equal(t.powerOn, false);
  assert.equal(t.at.getTime(), 1_760_000_000_000);
});

test('missing or garbage values become null', () => {
  const t = mapPayload({ containerNo: 'X', sstemp: 'n/a' }, 't', DEFAULTS.mapping);
  assert.equal(t.supplyTemp, null);
  assert.equal(t.humidity, null);
  assert.equal(t.powerOn, null);
});

test('helpers', () => {
  assert.equal(getPath({ a: [{ b: 5 }] }, 'a.0.b'), 5);
  assert.equal(resolveDeviceId('payload:id', {}, 'x'), null);
});
