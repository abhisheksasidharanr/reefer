import { HttpError, idParam, route } from '@/lib/server/api';
import { applyOverride } from '@/lib/server/alerts';
import { db } from '@/lib/server/db';
import { getSettings } from '@/lib/server/settings';
import { describe, inScope } from '@/lib/rules';
import { fmtTemp } from '@/lib/units';

/** Every rule with how it applies to this reefer: in scope?, per-reefer override, effective wording, open alert. */
export const GET = route(async (_req, ctx) => {
  const id = idParam(ctx);
  const reefer = await db.reefer.findUnique({ where: { id } });
  if (!reefer) throw new HttpError(404, 'Reefer not found');
  const [rules, overrides, open, general] = await Promise.all([
    db.alertRule.findMany({ orderBy: [{ severity: 'asc' }, { name: 'asc' }] }),
    db.ruleOverride.findMany({ where: { reeferId: id } }),
    db.alert.findMany({ where: { reeferId: id, status: { in: ['active', 'acknowledged'] } }, select: { ruleId: true, status: true } }),
    getSettings('general'),
  ]);
  const fmt = (c: number, d?: boolean) => fmtTemp(c, general.tempUnit, d);
  return rules.map((r) => {
    const o = overrides.find((x) => x.ruleId === r.id) ?? null;
    const effective = applyOverride(r, o ?? undefined);
    const applies = r.enabled && inScope(r.scope, r.scopeValue, reefer);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      metric: r.metric,
      operator: r.operator,
      useTolerance: r.useTolerance,
      ruleEnabled: r.enabled,
      inScope: inScope(r.scope, r.scopeValue, reefer),
      scope: r.scope,
      defaults: { threshold: r.threshold, threshold2: r.threshold2, durationSec: r.durationSec, severity: r.severity },
      override: o,
      active: applies && effective !== null,
      severity: (effective ?? r).severity,
      sentence: describe(effective ?? r, fmt),
      openAlert: open.find((a) => a.ruleId === r.id)?.status ?? null,
    };
  });
});

export const dynamic = 'force-dynamic';
