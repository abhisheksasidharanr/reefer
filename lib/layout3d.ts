// Automatic 3D yard layout — reefers have no real position, so we arrange them in labelled lanes.
// Pure function (unit-tested in layout3d.test.ts).

export const BOX = { length: 12.19, height: 2.59, width: 2.44 }; // 40 ft high-cube-ish reefer
const GAP_X = 1.4; // between containers in a row
const GAP_Z = 1.6; // between rows
const AISLE = 12; // between groups (room for lane labels)

export interface LayoutItem {
  id: number;
  group: string;
}
export interface Placed {
  id: number;
  x: number;
  z: number;
}
export interface GroupBand {
  key: string;
  count: number;
  x: number;
  z: number;
  width: number;
  depth: number;
}

/** Lay items out in groups; each group fills rows of `perRow` containers, groups stacked along z. */
export function layoutFleet(items: LayoutItem[], groupOrder: string[], perRow = 6): { placed: Placed[]; groups: GroupBand[]; width: number; depth: number } {
  const byGroup = new Map<string, LayoutItem[]>();
  for (const it of items) (byGroup.get(it.group) ?? byGroup.set(it.group, []).get(it.group)!).push(it);
  const order = [...groupOrder.filter((g) => byGroup.has(g)), ...[...byGroup.keys()].filter((g) => !groupOrder.includes(g)).sort()];

  const pitchX = BOX.length + GAP_X;
  const pitchZ = BOX.width + GAP_Z;
  const cols = Math.max(1, Math.min(perRow, Math.max(...[...byGroup.values()].map((g) => g.length), 1)));
  const width = cols * pitchX - GAP_X;

  const placed: Placed[] = [];
  const groups: GroupBand[] = [];
  let z = 0;
  for (const key of order) {
    const list = byGroup.get(key)!;
    const rows = Math.ceil(list.length / cols);
    list.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      placed.push({ id: it.id, x: col * pitchX + BOX.length / 2 - width / 2, z: z + row * pitchZ + BOX.width / 2 });
    });
    const depth = rows * pitchZ - GAP_Z;
    groups.push({ key, count: list.length, x: -width / 2, z, width, depth });
    z += depth + AISLE;
  }
  const depth = Math.max(0, z - AISLE);
  // Centre on the origin along z too.
  for (const p of placed) p.z -= depth / 2;
  for (const g of groups) g.z -= depth / 2;
  return { placed, groups, width, depth };
}

/** Blue (cold) → teal (on target) → amber → red (warm) by deviation relative to tolerance. */
export function deviationColor(dev: number | null, tolerance: number): string {
  if (dev === null) return '#94a3b8';
  const r = dev / Math.max(tolerance, 0.1);
  if (r <= -2) return '#1d4ed8';
  if (r < -1) return '#3b82f6';
  if (r <= 1) return '#14b8a6';
  if (r <= 2) return '#f59e0b';
  if (r <= 3) return '#f97316';
  return '#ef4444';
}
