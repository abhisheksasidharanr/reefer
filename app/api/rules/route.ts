import { route } from '@/lib/server/api';
import { invalidateRules } from '@/lib/server/alerts';
import { db } from '@/lib/server/db';
import { ruleInput } from '@/lib/server/rules-input';

export const GET = route(async () => {
  const [rules, open] = await Promise.all([
    db.alertRule.findMany({ orderBy: [{ severity: 'asc' }, { name: 'asc' }] }),
    db.alert.groupBy({ by: ['ruleId'], _count: true, where: { status: { in: ['active', 'acknowledged'] } } }),
  ]);
  const n = new Map(open.map((o) => [o.ruleId, o._count]));
  return rules.map((r) => ({ ...r, openAlerts: n.get(r.id) ?? 0 }));
});

export const POST = route(async (req) => {
  const rule = await db.alertRule.create({ data: ruleInput.parse(await req.json()) });
  invalidateRules();
  return rule;
}, 'admin');

export const dynamic = 'force-dynamic';
