/** Temperatures are stored in °C; display follows the site setting. */
export function toUnit(c: number, unit: 'C' | 'F', delta = false): number {
  if (unit === 'C') return c;
  return delta ? c * 1.8 : c * 1.8 + 32;
}

export function fromUnit(v: number, unit: 'C' | 'F', delta = false): number {
  if (unit === 'C') return v;
  return delta ? v / 1.8 : (v - 32) / 1.8;
}

export function fmtTemp(c: number | null | undefined, unit: 'C' | 'F' = 'C', delta = false, digits = 1): string {
  if (c === null || c === undefined || !Number.isFinite(c)) return '—';
  return `${toUnit(c, unit, delta).toFixed(digits)} °${unit}`;
}
