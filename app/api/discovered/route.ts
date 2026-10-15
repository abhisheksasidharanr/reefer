import { z } from 'zod';
import { HttpError, route } from '@/lib/server/api';
import { db } from '@/lib/server/db';

export const GET = route(async (req) => {
  const showIgnored = req.nextUrl.searchParams.get('ignored') === '1';
  return db.discoveredDevice.findMany({ where: showIgnored ? {} : { ignored: false }, orderBy: { lastSeenAt: 'desc' } });
});

/** ignore / unignore / delete a discovered device (registration goes through POST /api/reefers). */
export const POST = route(async (req) => {
  const { deviceId, action } = z.object({ deviceId: z.string(), action: z.enum(['ignore', 'unignore', 'delete']) }).parse(await req.json());
  const found = await db.discoveredDevice.findUnique({ where: { deviceId } });
  if (!found) throw new HttpError(404, 'Device not found');
  if (action === 'delete') await db.discoveredDevice.delete({ where: { deviceId } });
  else await db.discoveredDevice.update({ where: { deviceId }, data: { ignored: action === 'ignore' } });
  return { ok: true };
}, 'operator');

export const dynamic = 'force-dynamic';
