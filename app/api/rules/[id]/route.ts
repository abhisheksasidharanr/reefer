import { idParam, route } from '@/lib/server/api';
import { invalidateRules, sweep } from '@/lib/server/alerts';
import { bus } from '@/lib/server/bus';
import { db } from '@/lib/server/db';
import { ruleInput } from '@/lib/server/rules-input';

export const PATCH = route(async (req, ctx) => {
  const id = idParam(ctx);
  const body = await req.json();
  // Toggle-only updates skip full validation.
  const data = Object.keys(body).length === 1 && 'enabled' in body ? { enabled: !!body.enabled } : ruleInput.parse(body);
  const rule = await db.alertRule.update({ where: { id }, data });
  await db.ruleState.deleteMany({ where: { ruleId: id } });
  invalidateRules();
  sweep().catch(() => undefined); // re-evaluate now so the change is visible immediately
  return rule;
}, 'admin');

export const DELETE = route(async (_req, ctx) => {
  const id = idParam(ctx);
  // Close the rule's open alerts first — once ruleId is nulled the engine no longer tracks them.
  await db.alert.updateMany({
    where: { ruleId: id, status: { in: ['active', 'acknowledged'] } },
    data: { status: 'resolved', resolvedAt: new Date(), resolvedBy: ctx.session.name, note: 'Rule deleted' },
  });
  bus.emit('alert', { kind: 'resolved', ruleId: id });
  await db.ruleState.deleteMany({ where: { ruleId: id } });
  await db.alertRule.delete({ where: { id } });
  invalidateRules();
  return { ok: true };
}, 'admin');

export const dynamic = 'force-dynamic';
