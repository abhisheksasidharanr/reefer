import type { Alert, AlertRule, Reefer, RuleOverride } from '@prisma/client';
import { describe, evaluate, inScope, METRICS, Metric, Snapshot } from '../rules';
import { fmtTemp } from '../units';
import { bus } from './bus';
import { db } from './db';
import { notifyAlert } from './notify';
import { getSettings } from './settings';

const g = globalThis as unknown as { __ruleCache?: { at: number; rules: AlertRule[] }; __locks?: Map<number, Promise<unknown>> };
const locks = (g.__locks ??= new Map());

/** Serialise work per reefer so ingest and the periodic sweep can't open duplicate alerts. */
function withLock<T>(reeferId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(reeferId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(reeferId, next);
  next.finally(() => locks.get(reeferId) === next && locks.delete(reeferId)).catch(() => undefined);
  return next;
}

export function invalidateRules() {
  g.__ruleCache = undefined;
}

async function enabledRules(): Promise<AlertRule[]> {
  const c = g.__ruleCache;
  if (c && Date.now() - c.at < 15_000) return c.rules;
  const rules = await db.alertRule.findMany({ where: { enabled: true } });
  g.__ruleCache = { at: Date.now(), rules };
  return rules;
}

/** Rule as it applies to one reefer: null when switched off for it, otherwise with its custom limits. */
export function applyOverride(rule: AlertRule, o: RuleOverride | undefined): AlertRule | null {
  if (!o) return rule;
  if (!o.enabled) return null;
  return {
    ...rule,
    threshold: o.threshold ?? rule.threshold,
    threshold2: o.threshold2 ?? rule.threshold2,
    durationSec: o.durationSec ?? rule.durationSec,
    severity: o.severity ?? rule.severity,
  };
}

const snapshotOf = (r: Reefer, defaultTolerance: number): Snapshot => ({
  lastSeenAt: r.lastSeenAt,
  createdAt: r.createdAt,
  setTemp: r.setTemp,
  supplyTemp: r.supplyTemp,
  returnTemp: r.returnTemp,
  humidity: r.humidity,
  voltage: r.voltage,
  current: r.current,
  powerOn: r.powerOn,
  faultCode: r.faultCode,
  targetTemp: r.targetTemp,
  tolerance: r.tolerance ?? defaultTolerance,
});

function valueText(metric: string, v: number | null, unit: 'C' | 'F') {
  if (metric === 'offline') return v === null ? 'never reported' : v >= 120 ? `${Math.round(v / 60)} h` : `${Math.round(v)} min`;
  if (v === null) return '';
  const m = METRICS[metric as Metric];
  if (!m) return String(v);
  if (m.unit === 'temp') return fmtTemp(v, unit);
  if (m.unit === 'tempDelta') return fmtTemp(v, unit, true);
  if (m.kind === 'bool') return metric === 'fault' ? `code ${v}` : '';
  return `${v} ${m.unit}`;
}

async function publish(alert: Alert, reefer: Reefer, rule: AlertRule | null, kind: 'triggered' | 'reminder' | 'resolved') {
  bus.emit('alert', { id: alert.id, kind, severity: alert.severity, title: alert.title, reeferId: reefer.id, containerNo: reefer.containerNo });
  if (!rule) return;
  await notifyAlert(
    { ...alert, reefer: { id: reefer.id, containerNo: reefer.containerNo, name: reefer.name }, kind },
    { email: rule.notifyEmail, hook: rule.notifyHook },
  );
}

/** Evaluate every applicable rule for one reefer and open / remind / resolve alerts. */
export function evaluateReefer(reeferId: number, now = new Date()) {
  return withLock(reeferId, async () => {
    const reefer = await db.reefer.findUnique({ where: { id: reeferId } });
    if (!reefer || !reefer.active) return;
    const general = await getSettings('general');
    const snap = snapshotOf(reefer, general.defaultTolerance);
    const overrides = await db.ruleOverride.findMany({ where: { reeferId } });
    const rules = (await enabledRules())
      .filter((r) => inScope(r.scope, r.scopeValue, reefer))
      .map((r) => applyOverride(r, overrides.find((o) => o.ruleId === r.id)))
      .filter((r): r is AlertRule => r !== null);
    const [states, open] = await Promise.all([
      db.ruleState.findMany({ where: { reeferId } }),
      db.alert.findMany({ where: { reeferId, status: { in: ['active', 'acknowledged'] }, ruleId: { not: null } } }),
    ]);

    for (const rule of rules) {
      const ev = evaluate(rule, snap, now);
      const state = states.find((s) => s.ruleId === rule.id);
      const existing = open.find((a) => a.ruleId === rule.id);

      if (!ev.active) {
        if (state) await db.ruleState.delete({ where: { ruleId_reeferId: { ruleId: rule.id, reeferId } } });
        if (existing && rule.autoResolve) {
          const resolved = await db.alert.update({ where: { id: existing.id }, data: { status: 'resolved', resolvedAt: now, resolvedBy: 'system' } });
          await publish(resolved, reefer, rule, 'resolved');
        }
        continue;
      }

      const since = state?.since ?? now;
      if (!state) await db.ruleState.create({ data: { ruleId: rule.id, reeferId, since: now } });
      if (now.getTime() - since.getTime() < rule.durationSec * 1000) continue; // not sustained long enough yet
      if (!existing && state?.suppressed) continue; // resolved by hand — wait until the condition clears

      if (!existing) {
        const label = METRICS[rule.metric as Metric]?.label ?? rule.metric;
        const vt = valueText(rule.metric, ev.value, general.tempUnit);
        const alert = await db.alert.create({
          data: {
            ruleId: rule.id,
            reeferId,
            severity: rule.severity,
            title: rule.name,
            message: `${label}${vt ? `: ${vt}` : ''}. ${describe(rule, (c, d) => fmtTemp(c, general.tempUnit, d))}.`,
            value: ev.value,
            triggeredAt: now,
            lastNotifiedAt: now,
          },
        });
        await publish(alert, reefer, rule, 'triggered');
      } else {
        // Keep the latest value; remind while unacknowledged.
        const due =
          existing.status === 'active' &&
          rule.repeatMin > 0 &&
          (!existing.lastNotifiedAt || now.getTime() - existing.lastNotifiedAt.getTime() >= rule.repeatMin * 60_000);
        const updated = await db.alert.update({
          where: { id: existing.id },
          data: { value: ev.value, ...(due ? { lastNotifiedAt: now } : {}) },
        });
        if (due) await publish(updated, reefer, rule, 'reminder');
      }
    }

    // Alerts whose rule was disabled / deleted / scoped out resolve too.
    for (const a of open) {
      if (!rules.some((r) => r.id === a.ruleId)) {
        await db.alert.update({ where: { id: a.id }, data: { status: 'resolved', resolvedAt: now, resolvedBy: 'system', note: a.note ?? 'Rule no longer applies' } });
        bus.emit('alert', { id: a.id, kind: 'resolved', severity: a.severity, title: a.title, reeferId, containerNo: reefer.containerNo });
      }
    }
  });
}

/** Periodic pass: offline detection, sustained durations, reminders. */
export async function sweep() {
  const reefers = await db.reefer.findMany({ where: { active: true }, select: { id: true } });
  for (const r of reefers) await evaluateReefer(r.id).catch((e) => console.error('[alerts] sweep', r.id, e));
}
