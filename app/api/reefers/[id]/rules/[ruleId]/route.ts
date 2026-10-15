import { z } from 'zod';
import { HttpError, idParam, route } from '@/lib/server/api';
import { evaluateReefer } from '@/lib/server/alerts';
import { db } from '@/lib/server/db';

const num = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), 'must be a number');

const body = z.object({
  enabled: z.boolean().default(true),
  threshold: num,
  threshold2: num,
  durationSec: num.refine((v) => v === null || (v >= 0 && v <= 7 * 86400), 'must be between 0 and 7 days'),
  severity: z.enum(['info', 'warning', 'critical']).optional().nullable(),
});

async function target(ctx: { params: Record<string, string> }) {
  const reeferId = idParam(ctx);
  const ruleId = Number(ctx.params.ruleId);
  const [reefer, rule] = await Promise.all([db.reefer.findUnique({ where: { id: reeferId } }), db.alertRule.findUnique({ where: { id: ruleId } })]);
  if (!reefer || !rule) throw new HttpError(404, 'Reefer or rule not found');
  return { reeferId, ruleId };
}

/** Customise a rule for one reefer (switch off, or change limits / duration / severity). */
export const PUT = route(async (req, ctx) => {
  const { reeferId, ruleId } = await target(ctx);
  const b = body.parse(await req.json());
  const data = { enabled: b.enabled, threshold: b.threshold, threshold2: b.threshold2, durationSec: b.durationSec, severity: b.severity ?? null };
  const o = await db.ruleOverride.upsert({ where: { ruleId_reeferId: { ruleId, reeferId } }, update: data, create: { ruleId, reeferId, ...data } });
  await db.ruleState.deleteMany({ where: { ruleId, reeferId } }); // restart the duration clock with the new limits
  await evaluateReefer(reeferId);
  return o;
}, 'operator');

/** Back to the rule's own settings. */
export const DELETE = route(async (_req, ctx) => {
  const { reeferId, ruleId } = await target(ctx);
  await db.ruleOverride.deleteMany({ where: { ruleId, reeferId } });
  await db.ruleState.deleteMany({ where: { ruleId, reeferId } });
  await evaluateReefer(reeferId);
  return { ok: true };
}, 'operator');

export const dynamic = 'force-dynamic';
