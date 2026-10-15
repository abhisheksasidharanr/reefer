'use client';

import clsx from 'clsx';
import { Bell, Copy, Mail, Pencil, Plus, ShieldAlert, Trash2, Webhook, Wand2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useCan, useTemp } from '@/components/providers';
import { Badge, Button, EmptyState, Field, PageHeader, SeverityBadge, SlideOver, Skeleton, Switch, useFeedback } from '@/components/ui';
import { api, useData } from '@/lib/client';
import { describe, METRICS, Metric, OPERATORS } from '@/lib/rules';
import { fromUnit, toUnit } from '@/lib/units';

interface Rule {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  metric: string;
  operator: string;
  threshold: number;
  threshold2: number | null;
  useTolerance: boolean;
  durationSec: number;
  severity: string;
  scope: string;
  scopeValue: string;
  repeatMin: number;
  notifyEmail: boolean;
  notifyHook: boolean;
  autoResolve: boolean;
  openAlerts: number;
}

type Draft = Omit<Rule, 'id' | 'openAlerts' | 'scopeValue'> & { scopeValue: (string | number)[] };

const blank = (): Draft => ({
  name: '',
  description: '',
  enabled: true,
  metric: 'deviation',
  operator: 'gt',
  threshold: 0,
  threshold2: null,
  useTolerance: true,
  durationSec: 600,
  severity: 'warning',
  scope: 'all',
  scopeValue: [],
  repeatMin: 0,
  notifyEmail: false,
  notifyHook: false,
  autoResolve: true,
});

const TEMPLATES: { label: string; draft: Partial<Draft> }[] = [
  { label: 'Out of tolerance', draft: { name: 'Temperature out of tolerance', metric: 'deviation', operator: 'gt', threshold: 0, useTolerance: true, durationSec: 600, severity: 'warning' } },
  { label: 'Severe excursion', draft: { name: 'Severe temperature excursion', metric: 'deviation', operator: 'gt', threshold: 3, useTolerance: true, durationSec: 300, severity: 'critical', notifyEmail: true, repeatMin: 30 } },
  { label: 'Pharma 2–8 °C', draft: { name: 'Pharma outside 2–8 °C', metric: 'supply_temp', operator: 'outside', threshold: 2, threshold2: 8, useTolerance: false, durationSec: 120, severity: 'critical', scope: 'tags', scopeValue: ['pharma'], notifyEmail: true, notifyHook: true, repeatMin: 15 } },
  { label: 'Powered off', draft: { name: 'Powered off', metric: 'power_off', durationSec: 300, severity: 'warning', useTolerance: false } },
  { label: 'Fault code', draft: { name: 'Reefer fault', metric: 'fault', durationSec: 0, severity: 'critical', useTolerance: false } },
  { label: 'No data', draft: { name: 'No data received', metric: 'offline', operator: 'gt', threshold: 15, durationSec: 0, severity: 'critical', useTolerance: false } },
  { label: 'High humidity', draft: { name: 'High humidity', metric: 'humidity', operator: 'gt', threshold: 95, durationSec: 1800, severity: 'info', useTolerance: false } },
  { label: 'Low voltage', draft: { name: 'Low supply voltage', metric: 'voltage', operator: 'lt', threshold: 360, durationSec: 300, severity: 'warning', useTolerance: false } },
];

const TEMP_KIND = (metric: string) => METRICS[metric as Metric]?.unit;
const isDelta = (metric: string) => TEMP_KIND(metric) === 'tempDelta';
const isTemp = (metric: string) => TEMP_KIND(metric) === 'temp';
const isBool = (metric: string) => METRICS[metric as Metric]?.kind === 'bool';

export default function RulesPage() {
  return (
    <Suspense>
      <RulesInner />
    </Suspense>
  );
}

function RulesInner() {
  const can = useCan();
  const { fmt } = useTemp();
  const { toast, confirm } = useFeedback();
  const { data, loading, refresh } = useData<Rule[]>('/api/rules');
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  // /rules?new=1&reefer=ID → builder pre-scoped to that reefer
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || params.get('new') !== '1' || !can('admin')) return;
    openedFromUrl.current = true;
    const rid = Number(params.get('reefer'));
    setEditing({ draft: { ...blank(), ...(rid ? { scope: 'reefers', scopeValue: [rid], name: '' } : {}) } });
    router.replace('/rules');
  }, [params, can, router]);

  const parseScope = (s: string) => {
    try {
      return JSON.parse(s) as (string | number)[];
    } catch {
      return [];
    }
  };

  const toggle = async (r: Rule) => {
    await api(`/api/rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } });
    toast({ tone: 'success', title: r.enabled ? 'Rule paused' : 'Rule enabled', body: r.name });
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Alert rules"
        description="Define when the warning system raises an alert, how serious it is and who gets told."
        actions={can('admin') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ draft: blank() })}>New rule</Button>}
      />

      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : !data?.length ? (
        <div className="card">
          <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="No alert rules" body="Create a rule or start from a template." action={can('admin') && <Button onClick={() => setEditing({ draft: blank() })}>New rule</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((r) => {
            const scope = parseScope(r.scopeValue);
            return (
              <div key={r.id} className={clsx('card flex flex-col gap-4 p-5 transition', !r.enabled && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{r.name}</h3>
                      <SeverityBadge severity={r.severity} />
                      {r.openAlerts > 0 && <Badge className="bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">{r.openAlerts} open</Badge>}
                    </div>
                    {r.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{r.description}</p>}
                  </div>
                  {can('admin') && <Switch checked={r.enabled} onChange={() => toggle(r)} />}
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/50">{describe(r, (c, d) => fmt(c, d))}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge>{r.scope === 'all' ? 'All reefers' : r.scope === 'tags' ? `Tags: ${scope.join(', ')}` : `${scope.length} reefer${scope.length === 1 ? '' : 's'}`}</Badge>
                  <span className="flex items-center gap-1">
                    <Bell className="h-3.5 w-3.5" /> In-app
                  </span>
                  {r.notifyEmail && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </span>
                  )}
                  {r.notifyHook && (
                    <span className="flex items-center gap-1">
                      <Webhook className="h-3.5 w-3.5" /> Webhook
                    </span>
                  )}
                  {r.repeatMin > 0 && <span>· reminds every {r.repeatMin} min</span>}
                  {r.autoResolve && <span>· auto-resolves</span>}
                  {can('admin') && (
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing({ id: r.id, draft: { ...r, scopeValue: scope } })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => setEditing({ draft: { ...r, name: `${r.name} (copy)`, scopeValue: scope } })} aria-label="Duplicate" />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        aria-label="Delete"
                        onClick={async () => {
                          if (!(await confirm({ title: `Delete “${r.name}”?`, body: 'Existing alerts from this rule are kept but resolved.', confirmLabel: 'Delete', danger: true }))) return;
                          await api(`/api/rules/${r.id}`, { method: 'DELETE' });
                          toast({ tone: 'success', title: 'Rule deleted' });
                          refresh();
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <RuleBuilder
          id={editing.id}
          initial={editing.draft}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function RuleBuilder({ id, initial, onClose, onSaved }: { id?: number; initial: Draft; onClose: () => void; onSaved: () => void }) {
  const { unit, fmt } = useTemp();
  const { toast } = useFeedback();
  const reefers = useData<{ id: number; containerNo: string; name: string | null; tags: string }[]>('/api/reefers');
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ sentence: string; inScope: number; matches: { id: number; containerNo: string; value: number | null }[] } | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [durUnit, setDurUnit] = useState<'s' | 'min' | 'h'>(initial.durationSec % 3600 === 0 && initial.durationSec ? 'h' : initial.durationSec % 60 === 0 ? 'min' : 's');

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // Thresholds are stored in °C; the form shows the site unit.
  const show = (c: number | null) => (c === null ? '' : String(Math.round((isTemp(d.metric) ? toUnit(c, unit) : isDelta(d.metric) ? toUnit(c, unit, true) : c) * 100) / 100));
  const store = (v: string) => (v === '' ? 0 : isTemp(d.metric) ? fromUnit(Number(v), unit) : isDelta(d.metric) ? fromUnit(Number(v), unit, true) : Number(v));
  const unitLabel = isTemp(d.metric) || isDelta(d.metric) ? `°${unit}` : d.metric === 'offline' ? 'minutes' : METRICS[d.metric as Metric]?.unit;
  const durFactor = { s: 1, min: 60, h: 3600 }[durUnit];
  const range = d.operator === 'outside' || d.operator === 'between';
  const allTags = useMemo(() => [...new Set((reefers.data ?? []).flatMap((r) => r.tags.split(',').map((t) => t.trim()).filter(Boolean)))], [reefers.data]);

  // Live preview (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      api<typeof preview>('/api/rules/preview', { body: { ...d, name: d.name || 'Preview' } })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [d]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(id ? `/api/rules/${id}` : '/api/rules', { method: id ? 'PATCH' : 'POST', body: d });
      toast({ tone: 'success', title: id ? 'Rule updated' : 'Rule created', body: d.name });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const metricGroups: [string, Metric[]][] = [
    ['Temperature', ['deviation', 'supply_temp', 'return_temp', 'set_temp', 'target_mismatch']],
    ['Unit health', ['fault', 'power_off', 'offline']],
    ['Electrical & climate', ['humidity', 'voltage', 'current']],
  ];

  return (
    <SlideOver
      open
      wide
      onClose={onClose}
      title={id ? 'Edit alert rule' : 'New alert rule'}
      description="Build the condition in plain terms — the preview shows what would trigger right now."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!d.name.trim()}>
            {id ? 'Save rule' : 'Create rule'}
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        {!id && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Wand2 className="h-3.5 w-3.5" /> Start from a template
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button key={t.label} type="button" onClick={() => setD({ ...blank(), ...t.draft })} className="rounded-full border px-3 py-1.5 text-xs hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">{error}</div>}

        <section className="grid grid-cols-1 gap-4">
          <Field label="Rule name *">
            <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Temperature out of tolerance" />
          </Field>
          <Field label="Description" hint="Shown to operators — say what to do.">
            <input className="input" value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Condition</h3>
          <Field label="Watch">
            <select
              className="input"
              value={d.metric}
              onChange={(e) => {
                const m = e.target.value;
                setD({ ...d, metric: m, useTolerance: m === 'deviation' || m === 'target_mismatch' ? d.useTolerance : false, threshold: m === 'offline' ? 15 : d.threshold });
              }}
            >
              {metricGroups.map(([g, ms]) => (
                <optgroup key={g} label={g}>
                  {ms.map((m) => (
                    <option key={m} value={m}>
                      {METRICS[m].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          {!isBool(d.metric) && (
            <>
              {(d.metric === 'deviation' || d.metric === 'target_mismatch') && (
                <div className="rounded-xl border p-4">
                  <Switch
                    checked={d.useTolerance}
                    onChange={(v) => set('useTolerance', v)}
                    label="Use each reefer’s own tolerance"
                    description="Threshold = the reefer’s allowed deviation (or the site default) plus the margin below. Pharma units can be strict while fruit is relaxed — with one rule."
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {d.metric !== 'offline' && (
                  <Field label="When it">
                    <select className="input" value={d.operator} onChange={(e) => set('operator', e.target.value)}>
                      {Object.entries(OPERATORS)
                        .filter(([k]) => !d.useTolerance || ['gt', 'gte'].includes(k))
                        .map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Field label={d.useTolerance ? `Extra margin (${unitLabel})` : range ? `From (${unitLabel})` : d.metric === 'offline' ? 'No data for (minutes)' : `Value (${unitLabel})`}>
                  <input className="input tabular" type="number" step="0.1" value={show(d.threshold)} onChange={(e) => set('threshold', store(e.target.value))} />
                </Field>
                {range && (
                  <Field label={`To (${unitLabel})`}>
                    <input className="input tabular" type="number" step="0.1" value={show(d.threshold2)} onChange={(e) => set('threshold2', e.target.value === '' ? null : store(e.target.value))} />
                  </Field>
                )}
              </div>
            </>
          )}

          {d.metric !== 'offline' && (
            <Field label="For at least" hint="Ignore short spikes, e.g. door openings during inspection. 0 = alert immediately.">
              <div className="flex gap-2">
                <input className="input tabular w-32" type="number" min="0" value={d.durationSec / durFactor} onChange={(e) => set('durationSec', Math.round(Number(e.target.value || 0) * durFactor))} />
                <select className="input w-32" value={durUnit} onChange={(e) => setDurUnit(e.target.value as 's' | 'min' | 'h')}>
                  <option value="s">seconds</option>
                  <option value="min">minutes</option>
                  <option value="h">hours</option>
                </select>
              </div>
            </Field>
          )}

          <Field label="Severity">
            <div className="grid grid-cols-3 gap-2">
              {(['info', 'warning', 'critical'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('severity', s)}
                  className={clsx(
                    'rounded-xl border px-3 py-3 text-left text-sm transition',
                    d.severity === s
                      ? s === 'critical'
                        ? 'border-red-400 bg-red-50 dark:bg-red-500/10'
                        : s === 'warning'
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10'
                          : 'border-sky-400 bg-sky-50 dark:bg-sky-500/10'
                      : 'hover:border-slate-300',
                  )}
                >
                  <div className="font-medium capitalize">{s}</div>
                  <div className="text-xs text-slate-500">{s === 'critical' ? 'Cargo at risk' : s === 'warning' ? 'Needs attention' : 'For information'}</div>
                </button>
              ))}
            </div>
          </Field>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Applies to</h3>
          <div className="flex gap-2">
            {(
              [
                ['all', 'All reefers'],
                ['tags', 'Reefers with tags'],
                ['reefers', 'Specific reefers'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setD({ ...d, scope: k, scopeValue: [] })}
                className={clsx('rounded-lg border px-3 py-2 text-sm', d.scope === k ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'hover:border-slate-300')}
              >
                {label}
              </button>
            ))}
          </div>
          {d.scope === 'tags' && (
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {d.scopeValue.map((t) => (
                  <Badge key={String(t)}>
                    {t}
                    <button onClick={() => set('scopeValue', d.scopeValue.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <input
                className="input"
                list="rule-tags"
                placeholder="Type a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    e.preventDefault();
                    if (!d.scopeValue.includes(tagInput.trim())) set('scopeValue', [...d.scopeValue, tagInput.trim()]);
                    setTagInput('');
                  }
                }}
              />
              <datalist id="rule-tags">
                {allTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          )}
          {d.scope === 'reefers' && (
            <div className="max-h-52 overflow-y-auto rounded-xl border p-2">
              {(reefers.data ?? []).map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={d.scopeValue.includes(r.id)}
                    onChange={(e) => set('scopeValue', e.target.checked ? [...d.scopeValue, r.id] : d.scopeValue.filter((x) => x !== r.id))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <span className="font-mono">{r.containerNo}</span>
                  <span className="truncate text-xs text-slate-500">{r.name}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notifications</h3>
          <div className="space-y-4 rounded-xl border p-4">
            <Switch checked disabled onChange={() => {}} label="In-app" description="Alert list, dashboard and pop-up (always on)." />
            <Switch checked={d.notifyEmail} onChange={(v) => set('notifyEmail', v)} label="Email" description="Sent to the recipients in Settings → Notifications." />
            <Switch checked={d.notifyHook} onChange={(v) => set('notifyHook', v)} label="Webhook" description="POST to your system (Teams, Slack, SMS gateway…)." />
            <Switch checked={d.autoResolve} onChange={(v) => set('autoResolve', v)} label="Auto-resolve" description="Close the alert automatically when the condition clears." />
          </div>
          <Field label="Remind every (minutes)" hint="Repeat notifications while the alert stays unacknowledged. 0 = notify once.">
            <input className="input tabular w-32" type="number" min="0" value={d.repeatMin} onChange={(e) => set('repeatMin', Number(e.target.value || 0))} />
          </Field>
        </section>

        <section className="rounded-2xl bg-gradient-to-br from-brand-50 to-sky-50 p-5 ring-1 ring-brand-100 dark:from-brand-500/10 dark:to-sky-500/5 dark:ring-brand-500/20">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">Preview</div>
          <p className="mt-2 font-medium">{preview?.sentence ?? describe({ ...d, threshold2: d.threshold2 }, (c, dl) => fmt(c, dl))}</p>
          {preview && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Applies to {preview.inScope} reefer{preview.inScope === 1 ? '' : 's'} ·{' '}
              {preview.matches.length ? (
                <b className="text-red-600 dark:text-red-400">
                  {preview.matches.length} would trigger now{d.durationSec ? ' (once the duration passes)' : ''}: {preview.matches.slice(0, 6).map((m) => m.containerNo).join(', ')}
                  {preview.matches.length > 6 ? '…' : ''}
                </b>
              ) : (
                'none would trigger right now'
              )}
            </p>
          )}
        </section>
      </div>
    </SlideOver>
  );
}
