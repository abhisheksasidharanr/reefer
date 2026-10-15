import { route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { ruleInput } from '@/lib/server/rules-input';
import { getSettings } from '@/lib/server/settings';
import { describe, evaluate, inScope } from '@/lib/rules';
import { fmtTemp } from '@/lib/units';

/** Which reefers match the (unsaved) rule right now, ignoring its duration. */
export const POST = route(async (req) => {
  const rule = ruleInput.parse(await req.json());
  const general = await getSettings('general');
  const reefers = await db.reefer.findMany({ where: { active: true } });
  const now = new Date();
  const scoped = reefers.filter((r) => inScope(rule.scope, rule.scopeValue, r));
  const matches = scoped
    .map((r) => ({
      id: r.id,
      containerNo: r.containerNo,
      name: r.name,
      ...evaluate(rule, { ...r, tolerance: r.tolerance ?? general.defaultTolerance }, now),
    }))
    .filter((m) => m.active);
  return {
    sentence: describe(rule, (c, d) => fmtTemp(c, general.tempUnit, d)),
    inScope: scoped.length,
    matches,
  };
});

export const dynamic = 'force-dynamic';
