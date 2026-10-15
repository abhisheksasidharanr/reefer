import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOX, deviationColor, layoutFleet } from './layout3d';

test('places every item once, groups in the given order, no overlaps', () => {
  const items = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: i + 1, group: 'ok' })),
    { id: 20, group: 'critical' },
    { id: 21, group: 'warning' },
  ];
  const { placed, groups } = layoutFleet(items, ['critical', 'warning', 'ok'], 6);
  assert.equal(placed.length, 10);
  assert.deepEqual(groups.map((g) => g.key), ['critical', 'warning', 'ok']);
  assert.equal(groups[2].count, 8);
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const overlap = Math.abs(a.x - b.x) < BOX.length && Math.abs(a.z - b.z) < BOX.width;
      assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
    }
});

test('unknown groups are appended alphabetically', () => {
  const { groups } = layoutFleet([{ id: 1, group: 'zeta' }, { id: 2, group: 'alpha' }, { id: 3, group: 'ok' }], ['ok']);
  assert.deepEqual(groups.map((g) => g.key), ['ok', 'alpha', 'zeta']);
});

test('deviation colours', () => {
  assert.equal(deviationColor(0.5, 2), '#14b8a6');
  assert.equal(deviationColor(5, 2), '#f97316');
  assert.equal(deviationColor(10, 2), '#ef4444');
  assert.equal(deviationColor(-5, 2), '#1d4ed8');
  assert.equal(deviationColor(null, 2), '#94a3b8');
});
