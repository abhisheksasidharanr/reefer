import { randomUUID } from 'node:crypto';
import { db } from './db';

/**
 * Tiny leader election through the settings table, for hosts that run several copies of the app
 * (e.g. Hostinger web apps). Only the copy holding a lease runs singleton jobs such as the demo feed
 * and the alert sweep. A lease expires `ttlMs` after its last renewal.
 */
const g = globalThis as unknown as { __instanceId?: string };
export const instanceId = (g.__instanceId ??= randomUUID());

export async function holdLease(name: string, ttlMs: number): Promise<boolean> {
  const key = `lease:${name}`;
  const now = Date.now();
  const next = JSON.stringify({ owner: instanceId, until: now + ttlMs });
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) {
    try {
      await db.setting.create({ data: { key, value: next } });
      return true;
    } catch {
      return false; // another copy created it first
    }
  }
  let cur: { owner?: string; until?: number } = {};
  try {
    cur = JSON.parse(row.value);
  } catch {
    /* corrupt → treat as expired */
  }
  if (cur.owner !== instanceId && (cur.until ?? 0) > now) return false;
  // Compare-and-set on the exact previous value, so two copies can't both take an expired lease.
  const { count } = await db.setting.updateMany({ where: { key, value: row.value }, data: { value: next } });
  return count === 1;
}
