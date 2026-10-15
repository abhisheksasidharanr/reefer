import { HttpError, idParam, route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { reeferInput } from '@/lib/server/reefers';
import { getSettings } from '@/lib/server/settings';
import { reeferStatus } from '@/lib/status';

export const GET = route(async (_req, ctx) => {
  const id = idParam(ctx);
  const r = await db.reefer.findUnique({ where: { id } });
  if (!r) throw new HttpError(404, 'Reefer not found');
  const [open, commands, general] = await Promise.all([
    db.alert.findMany({ where: { reeferId: id, status: { in: ['active', 'acknowledged'] } }, orderBy: { triggeredAt: 'desc' } }),
    db.command.findMany({ where: { reeferId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    getSettings('general'),
  ]);
  let extra: Record<string, unknown> = {};
  try {
    extra = r.extra ? JSON.parse(r.extra) : {};
  } catch {
    /* ignore */
  }
  return { ...r, extra, status: reeferStatus(r, open, general.offlineAfterSec), openAlerts: open, commands };
});

export const PATCH = route(async (req, ctx) => {
  const id = idParam(ctx);
  const data = reeferInput.partial().parse(await req.json());
  return db.reefer.update({ where: { id }, data });
}, 'operator');

export const DELETE = route(async (_req, ctx) => {
  await db.reefer.delete({ where: { id: idParam(ctx) } });
  return { ok: true };
}, 'admin');

export const dynamic = 'force-dynamic';
