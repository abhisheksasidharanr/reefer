'use client';

import clsx from 'clsx';
import { ChevronDown, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, useData } from '@/lib/client';
import { METRICS, Metric, OPERATORS } from '@/lib/rules';
import { fromUnit, toUnit } from '@/lib/units';
import { useCan, useLive, useTemp } from './providers';
import { Badge, Button, Card, EmptyState, Field, Modal, SeverityBadge, Switch, useFeedback } from './ui';

interface RuleForReefer {
  id: number;
  name: string;
  description: string | null;
  metric: string;
  operator: string;
  useTolerance: boolean;
  ruleEnabled: boolean;
  inScope: boolean;
  scope: string;
  defaults: { threshold: number; threshold2: number | null; durationSec: number; severity: string };
  override: { enabled: boolean; threshold: number | null; threshold2: number | null; durationSec: number | null; severity: string | null } | null;
  active: boolean;
  severity: string;
  sentence: string;
  openAlert: string | null;
}

const kind = (metric: string) => METRICS[metric as Metric];

/** Alert rules as they apply to one reefer, with per-reefer on/off and custom limits. */
export function ReeferRulesCard({ reeferId, onChanged }: { reeferId: number; onChanged?: () => void }) {
  const can = useCan();
  const { toast } = useFeedback();
  const { data, refresh } = useData<RuleForReefer[]>(`/api/reefers/${reeferId}/rules`);
  const [editing, setEditing] = useState<RuleForReefer | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  useLive(['alert'], () => refresh(), 2000);

  const applicable = (data ?? []).filter((r) => r.inScope && r.ruleEnabled);
  const others = (data ?? []).filter((r) => !r.inScope || !r.ruleEnabled);

  const toggle = async (r: RuleForReefer, enabled: boolean) => {
    try {
      await api(`/api/reefers/${reeferId}/rules/${r.id}`, {
        method: 'PUT',
        body: { enabled, threshold: r.override?.threshold ?? null, threshold2: r.override?.threshold2 ?? null, durationSec: r.override?.durationSec ?? null, severity: r.override?.severity ?? null },
      });
      toast({ tone: 'success', title: enabled ? 'Rule switched on for this reefer' : 'Rule switched off for this reefer', body: r.name });
      refresh();
      onChanged?.();
    } catch (e) {
      toast({ tone: 'error', title: 'Could not update', body: (e as Error).message });
    }
  };

  return (
    <Card
      title="Alert rules for this reefer"
      subtitle="Switch rules off or tune limits just for this unit. Other reefers are not affected."
      actions={
        can('admin') && (
          <Link href={`/rules?new=1&reefer=${reeferId}`}>
            <Button size="sm" variant="soft" icon={<Plus className="h-3.5 w-3.5" />}>
              Rule only for this reefer
            </Button>
          </Link>
        )
      }
      bodyClass="p-0"
    >
      {!data ? (
        <div className="p-5 text-sm text-slate-500">Loading…</div>
      ) : applicable.length === 0 ? (
        <EmptyState title="No rules apply" body="None of the alert rules cover this reefer yet." />
      ) : (
        <ul className="divide-y">
          {applicable.map((r) => {
            const custom = !!r.override && (r.override.threshold !== null || r.override.threshold2 !== null || r.override.durationSec !== null || r.override.severity !== null);
            const off = r.override?.enabled === false;
            return (
              <li key={r.id} className={clsx('flex items-start gap-4 px-5 py-4', off && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <SeverityBadge severity={r.severity} />
                    {custom && <Badge className="bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30">Custom for this reefer</Badge>}
                    {off && <Badge>Off for this reefer</Badge>}
                    {r.openAlert && <Badge className="bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">Alert {r.openAlert}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.sentence}</p>
                </div>
                {can('operator') && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="h-3.5 w-3.5" />} onClick={() => setEditing(r)} disabled={off}>
                      Customize
                    </Button>
                    <Switch checked={!off} onChange={(v) => toggle(r, v)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {others.length > 0 && (
        <div className="border-t">
          <button onClick={() => setShowOthers(!showOthers)} className="flex w-full items-center gap-2 px-5 py-3 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ChevronDown className={clsx('h-4 w-4 transition', showOthers && 'rotate-180')} />
            {others.length} rule{others.length === 1 ? '' : 's'} not applied to this reefer
          </button>
          {showOthers && (
            <ul className="divide-y border-t bg-slate-50/50 dark:bg-slate-900/30">
              {others.map((r) => (
                <li key={r.id} className="px-5 py-3 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{r.name}</span>
                  <span className="text-slate-500"> — {!r.ruleEnabled ? 'rule is paused for all reefers' : r.scope === 'tags' ? 'targets other tags' : 'targets other reefers'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && (
        <OverrideDialog
          reeferId={reeferId}
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
            onChanged?.();
          }}
        />
      )}
    </Card>
  );
}

function OverrideDialog({ reeferId, rule, onClose, onSaved }: { reeferId: number; rule: RuleForReefer; onClose: () => void; onSaved: () => void }) {
  const { unit } = useTemp();
  const { toast } = useFeedback();
  const m = kind(rule.metric);
  const isTemp = m?.unit === 'temp';
  const isDelta = m?.unit === 'tempDelta';
  const isBool = m?.kind === 'bool';
  const range = rule.operator === 'outside' || rule.operator === 'between';
  const unitLabel = isTemp || isDelta ? `°${unit}` : rule.metric === 'offline' ? 'min' : m?.unit;
  const show = (c: number | null | undefined) =>
    c === null || c === undefined ? '' : String(Math.round((isTemp ? toUnit(c, unit) : isDelta ? toUnit(c, unit, true) : c) * 100) / 100);
  const store = (v: string) => (v === '' ? null : isTemp ? fromUnit(Number(v), unit) : isDelta ? fromUnit(Number(v), unit, true) : Number(v));

  const o = rule.override;
  const [threshold, setThreshold] = useState(show(o?.threshold));
  const [threshold2, setThreshold2] = useState(show(o?.threshold2));
  const [durationMin, setDurationMin] = useState(o?.durationSec === null || o?.durationSec === undefined ? '' : String(o.durationSec / 60));
  const [severity, setSeverity] = useState(o?.severity ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/reefers/${reeferId}/rules/${rule.id}`, {
        method: 'PUT',
        body: { enabled: true, threshold: store(threshold), threshold2: store(threshold2), durationSec: durationMin === '' ? null : Math.round(Number(durationMin) * 60), severity: severity || null },
      });
      toast({ tone: 'success', title: 'Saved for this reefer', body: rule.name });
      onSaved();
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    await api(`/api/reefers/${reeferId}/rules/${rule.id}`, { method: 'DELETE' });
    toast({ tone: 'success', title: 'Back to the rule’s default settings' });
    onSaved();
  };

  const d = rule.defaults;
  const thresholdLabel = rule.useTolerance ? `Extra margin over tolerance (${unitLabel})` : rule.metric === 'offline' ? 'No data for (min)' : range ? `From (${unitLabel})` : `Limit (${unitLabel})`;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Customize “${rule.name}”`}
      description="Leave a field empty to keep the rule’s default. Changes apply to this reefer only."
      footer={
        <>
          {o && (
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={reset} className="mr-auto">
              Reset to default
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save for this reefer
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/50">
          <span className="text-slate-500">Watches </span>
          {m?.label.toLowerCase()}
          {!isBool && rule.metric !== 'offline' && <span className="text-slate-500"> · {OPERATORS[rule.operator as keyof typeof OPERATORS]}</span>}
        </div>
        {!isBool && (
          <div className={clsx('grid grid-cols-1 gap-4', range && 'sm:grid-cols-2')}>
            <Field label={thresholdLabel} hint={`Default: ${show(d.threshold) || '0'}`}>
              <input className="input tabular" type="number" step="0.1" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={show(d.threshold)} />
            </Field>
            {range && (
              <Field label={`To (${unitLabel})`} hint={`Default: ${show(d.threshold2)}`}>
                <input className="input tabular" type="number" step="0.1" value={threshold2} onChange={(e) => setThreshold2(e.target.value)} placeholder={show(d.threshold2)} />
              </Field>
            )}
          </div>
        )}
        {rule.metric !== 'offline' && (
          <Field label="For at least (minutes)" hint={`Default: ${d.durationSec / 60} min`}>
            <input className="input tabular" type="number" min="0" step="0.5" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder={String(d.durationSec / 60)} />
          </Field>
        )}
        <Field label="Severity" hint={`Default: ${d.severity}`}>
          <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Same as rule ({d.severity})</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
