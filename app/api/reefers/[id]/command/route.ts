import { z } from 'zod';
import { HttpError, idParam, route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { publishCommand } from '@/lib/server/mqtt';

const body = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setpoint'), value: z.coerce.number().min(-40).max(40) }),
  z.object({ type: z.literal('power'), value: z.enum(['on', 'off']) }),
]);

/** Send a remote command over MQTT; every attempt is logged. */
export const POST = route(async (req, ctx) => {
  const id = idParam(ctx);
  const cmd = body.parse(await req.json());
  const reefer = await db.reefer.findUnique({ where: { id } });
  if (!reefer) throw new HttpError(404, 'Reefer not found');
  try {
    const topic = await publishCommand(reefer.deviceId, cmd.type === 'setpoint' ? { setpoint: cmd.value } : { power: cmd.value });
    await db.command.create({ data: { reeferId: id, type: cmd.type, value: String(cmd.value), status: 'sent', createdBy: ctx.session.name } });
    return { ok: true, topic };
  } catch (e) {
    await db.command.create({ data: { reeferId: id, type: cmd.type, value: String(cmd.value), status: 'failed', error: (e as Error).message, createdBy: ctx.session.name } });
    throw new HttpError(502, (e as Error).message);
  }
}, 'operator');

export const dynamic = 'force-dynamic';
