import { z } from 'zod';
import { reeferStatus } from '../status';
import { db } from './db';
import { getSettings } from './settings';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optNum = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), 'must be a number');

export const reeferInput = z.object({
  containerNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,20}$/, 'use 4–20 letters/digits, e.g. MSKU1234565'),
  deviceId: z
    .string()
    .trim()
    .toUpperCase()
    .max(64)
    .optional()
    .transform((v) => v || undefined),
  name: optText(100),
  brand: optText(60),
  model: optText(60),
  targetTemp: optNum,
  tolerance: optNum.refine((v) => v === null || v >= 0, 'must be ≥ 0'),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      (Array.isArray(v) ? v : (v ?? '').split(','))
        .map((t) => t.trim())
        .filter(Boolean)
        .join(','),
    ),
  notes: optText(5000),
  active: z.boolean().optional(),
});

export async function listReefers() {
  const general = await getSettings('general');
  const [reefers, open] = await Promise.all([
    db.reefer.findMany({ orderBy: { containerNo: 'asc' } }),
    db.alert.findMany({ where: { status: { in: ['active', 'acknowledged'] } }, select: { reeferId: true, severity: true, status: true } }),
  ]);
  const now = Date.now();
  return reefers.map((r) => {
    const mine = open.filter((a) => a.reeferId === r.id);
    return {
      ...r,
      extra: undefined,
      status: reeferStatus(r, mine, general.offlineAfterSec, now),
      openAlerts: mine.length,
      unacked: mine.filter((a) => a.status === 'active').length,
    };
  });
}

/** Average readings into at most `points` buckets for charts. */
export async function readingSeries(reeferId: number, from: Date, to: Date, points = 360) {
  const rows = await db.reading.findMany({
    where: { reeferId, at: { gte: from, lte: to } },
    orderBy: { at: 'asc' },
    select: { at: true, setTemp: true, supplyTemp: true, returnTemp: true, humidity: true, voltage: true, current: true, powerOn: true },
  });
  if (rows.length <= points) return rows.map((r) => ({ ...r, t: r.at.getTime() }));
  const span = (to.getTime() - from.getTime()) / points;
  const buckets = new Map<number, typeof rows>();
  for (const r of rows) {
    const k = Math.floor((r.at.getTime() - from.getTime()) / span);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(r);
  }
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
  };
  return [...buckets.entries()].map(([k, rs]) => ({
    t: Math.round(from.getTime() + (k + 0.5) * span),
    setTemp: avg(rs.map((r) => r.setTemp)),
    supplyTemp: avg(rs.map((r) => r.supplyTemp)),
    returnTemp: avg(rs.map((r) => r.returnTemp)),
    humidity: avg(rs.map((r) => r.humidity)),
    voltage: avg(rs.map((r) => r.voltage)),
    current: avg(rs.map((r) => r.current)),
    powerOn: rs.some((r) => r.powerOn === true) ? true : rs.some((r) => r.powerOn === false) ? false : null,
  }));
}

export const RANGES: Record<string, number> = { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 24 * 3600e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };

/** 6-hour supply-air trend per reefer (~36 points, 10-minute buckets) for sparklines. */
export async function sparklines(ids: number[]): Promise<Map<number, number[]>> {
  const since = new Date(Date.now() - 6 * 3600e3);
  const readings = await db.reading.findMany({
    where: { at: { gte: since }, reeferId: { in: ids }, supplyTemp: { not: null } },
    select: { reeferId: true, at: true, supplyTemp: true },
    orderBy: { at: 'asc' },
  });
  const buckets = new Map<number, Map<number, number[]>>();
  for (const r of readings) {
    const b = Math.floor((r.at.getTime() - since.getTime()) / 600_000);
    const m = buckets.get(r.reeferId) ?? buckets.set(r.reeferId, new Map()).get(r.reeferId)!;
    (m.get(b) ?? m.set(b, []).get(b)!).push(r.supplyTemp!);
  }
  const out = new Map<number, number[]>();
  for (const [id, m] of buckets)
    out.set(
      id,
      [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10),
    );
  return out;
}
