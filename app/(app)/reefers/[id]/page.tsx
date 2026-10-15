'use client';

import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Check, CheckCheck, CircleCheck, Download, MoreHorizontal, Pencil, Power, PowerOff, Send, Snowflake, Thermometer, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCan, useLive, useTemp } from '@/components/providers';
import { ReeferForm, ReeferRow, toForm } from '@/components/reefer-bits';
import { LiveStatus } from '@/components/live-status';
import { ReeferRulesCard } from '@/components/reefer-rules';
import { CHART_SERIES, Point, TempChart } from '@/components/temp-chart';
import { Badge, Button, Card, EmptyState, fmtDateTime, Segmented, SeverityBadge, Skeleton, StatusPill, Switch, Tabs, timeAgo, useFeedback } from '@/components/ui';
import { api, useData } from '@/lib/client';
import { fromUnit } from '@/lib/units';

interface DetailResp extends Omit<ReeferRow, 'openAlerts'> {
  extra: Record<string, unknown>;
  runHours: number | null;
  openAlerts: AlertRow[];
  commands: { id: number; type: string; value: string; status: string; error: string | null; createdBy: string; createdAt: string }[];
}
interface AlertRow {
  id: number;
  severity: string;
  status: string;
  title: string;
  message: string;
  triggeredAt: string;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
}

const RANGES = [
  ['1h', 3600e3],
  ['6h', 6 * 3600e3],
  ['24h', 24 * 3600e3],
  ['7d', 7 * 86400e3],
  ['30d', 30 * 86400e3],
] as const;

type LowerTab = 'history' | 'rules' | 'data';

export default function ReeferDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const { fmt, unit } = useTemp();
  const { toast, confirm } = useFeedback();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('24h');
  const [hidden, setHidden] = useState(new Set<string>());
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState<LowerTab>('history');
  const [historyLimit, setHistoryLimit] = useState(8);

  const detail = useData<DetailResp>(`/api/reefers/${id}`);
  const series = useData<{ points: Point[] }>(`/api/reefers/${id}/readings?range=${range}`);
  const alerts = useData<{ rows: AlertRow[] }>(`/api/alerts?reeferId=${id}&status=all`);
  useLive(['reading'], (_e, d) => {
    if ((d as { reeferId: number }).reeferId === Number(id)) {
      detail.refresh();
      series.refresh();
    }
  }, 2000);
  useLive(['alert'], () => {
    detail.refresh();
    alerts.refresh();
  });

  const r = detail.data;
  const sp = r ? r.setTemp ?? r.targetTemp : null;
  const dev = r && sp !== null && r.supplyTemp !== null ? r.supplyTemp - sp : null;
  const tol = r?.tolerance ?? 2;
  const band = sp !== null && sp !== undefined ? { lo: sp - tol, hi: sp + tol } : null;
  const extras = useMemo(() => Object.entries(r?.extra ?? {}).sort(([a], [b]) => a.localeCompare(b)), [r]);

  if (detail.error)
    return (
      <EmptyState
        title="Reefer not found"
        body={detail.error}
        action={
          <Link href="/reefers">
            <Button variant="secondary">Back to reefers</Button>
          </Link>
        }
      />
    );
  if (!r) return <Skeleton className="h-[600px]" />;

  const stale = r.status === 'offline' || r.status === 'never';
  const open = [...r.openAlerts].sort((a, b) => (a.severity === 'critical' ? -1 : 0) - (b.severity === 'critical' ? -1 : 0));
  const critical = open.some((a) => a.severity === 'critical');

  const act = async (ids: number[], action: 'acknowledge' | 'resolve') => {
    try {
      await api('/api/alerts', { body: { ids, action } });
      toast({ tone: 'success', title: action === 'acknowledge' ? 'Acknowledged' : 'Resolved', body: `${ids.length} alert${ids.length === 1 ? '' : 's'}` });
      alerts.refresh();
      detail.refresh();
    } catch (e) {
      toast({ tone: 'error', title: 'Action failed', body: (e as Error).message });
    }
  };

  return (
    <>
      {/* ── 1. Identity & status ── */}
      <div className="mb-5">
        <Link href="/reefers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Reefers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-sky-600 text-white shadow-lg shadow-brand-500/25">
              <Snowflake className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-mono text-2xl font-semibold tracking-tight">{r.containerNo}</h1>
                <StatusPill status={r.status} />
                {!r.active && <Badge>Monitoring paused</Badge>}
              </div>
              <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                {[r.name, [r.brand, r.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'No description'}
              </p>
              <p className={clsx('mt-0.5 flex items-center gap-1.5 text-xs', stale ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', stale ? 'bg-red-500' : 'animate-pulse bg-emerald-500')} />
                Last data {timeAgo(r.lastSeenAt)}
                {r.lastSeenAt && <span className="text-slate-400">· {fmtDateTime(r.lastSeenAt)}</span>}
              </p>
            </div>
          </div>
          {can('operator') && (
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <div className="relative">
                <Button variant="secondary" onClick={() => setMenu(!menu)} aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                {menu && (
                  <div className="card absolute right-0 z-20 mt-2 w-60 animate-fade-in bg-white p-1 shadow-lift dark:bg-slate-900" onMouseLeave={() => setMenu(false)}>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={async () => {
                        setMenu(false);
                        await api(`/api/reefers/${r.id}`, { method: 'PATCH', body: { active: !r.active } });
                        toast({ tone: 'success', title: r.active ? 'Monitoring paused' : 'Monitoring resumed' });
                        detail.refresh();
                      }}
                    >
                      {r.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      {r.active ? 'Pause monitoring' : 'Resume monitoring'}
                    </button>
                    <a href={`/api/reefers/${r.id}/readings?range=30d&format=csv`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Download className="h-4 w-4" /> Export 30 days (CSV)
                    </a>
                    {can('admin') && (
                      <button
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                        onClick={async () => {
                          setMenu(false);
                          if (!(await confirm({ title: `Delete ${r.containerNo}?`, body: 'All readings, alerts and command history for this reefer are deleted. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
                          await api(`/api/reefers/${r.id}`, { method: 'DELETE' });
                          toast({ tone: 'success', title: 'Reefer deleted' });
                          router.push('/reefers');
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Delete reefer
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Needs attention ── */}
      {open.length > 0 && (
        <section
          className={clsx(
            'mb-6 overflow-hidden rounded-2xl ring-1',
            critical ? 'bg-red-50 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30' : 'bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30',
          )}
        >
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <AlertTriangle className={clsx('h-5 w-5', critical ? 'text-red-600' : 'text-amber-600')} />
            <h2 className="text-sm font-semibold">
              {open.length} open alert{open.length === 1 ? '' : 's'} need{open.length === 1 ? 's' : ''} attention
            </h2>
            {can('operator') && open.length > 1 && (
              <div className="ml-auto flex gap-2">
                {open.some((a) => a.status === 'active') && (
                  <Button size="sm" variant="secondary" onClick={() => act(open.filter((a) => a.status === 'active').map((a) => a.id), 'acknowledge')}>
                    Acknowledge all
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => act(open.map((a) => a.id), 'resolve')}>
                  Resolve all
                </Button>
              </div>
            )}
          </div>
          <ul className="divide-y divide-black/5 border-t border-black/5 dark:divide-white/5 dark:border-white/5">
            {open.slice(0, 4).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 bg-white/60 px-5 py-3 dark:bg-slate-950/30">
                <SeverityBadge severity={a.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {a.message} <span className="text-slate-400">· since {timeAgo(a.triggeredAt)}</span>
                    {a.status === 'acknowledged' && <span className="text-slate-400"> · acknowledged by {a.acknowledgedBy}</span>}
                  </div>
                </div>
                {can('operator') && (
                  <div className="flex gap-1.5">
                    {a.status === 'active' && (
                      <Button size="sm" variant="secondary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => act([a.id], 'acknowledge')}>
                        Acknowledge
                      </Button>
                    )}
                    <Button size="sm" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => act([a.id], 'resolve')}>
                      Resolve
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {open.length > 4 && (
            <button onClick={() => setTab('history')} className="w-full px-5 py-2 text-left text-xs font-medium text-slate-600 hover:underline dark:text-slate-300">
              + {open.length - 4} more — see alert history below
            </button>
          )}
        </section>
      )}

      {/* ── 3 + 4. Temperature now & unit health ── */}
      <LiveStatus r={r} stale={stale} />

      {/* ── 5. History ── */}
      <Card
        className="mt-6"
        title="Temperature history"
        subtitle="Shaded band = set point ± allowed deviation"
        actions={
          <>
            <Segmented value={range} onChange={setRange} options={RANGES.map(([k]) => ({ value: k, label: k }))} />
            <a href={`/api/reefers/${r.id}/readings?range=${range}&format=csv`} title="Download this period as CSV">
              <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
                CSV
              </Button>
            </a>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {CHART_SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                const n = new Set(hidden);
                n.has(s.key) ? n.delete(s.key) : n.add(s.key);
                setHidden(n);
              }}
              className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset', hidden.has(s.key) ? 'text-slate-400 ring-slate-200 dark:ring-slate-700' : 'ring-slate-300 dark:ring-slate-600')}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: hidden.has(s.key) ? '#cbd5e1' : s.color }} />
              {s.name}
            </button>
          ))}
        </div>
        {series.data?.points.length ? (
          <TempChart points={series.data.points} unit={unit} rangeMs={RANGES.find(([k]) => k === range)![1]} band={band} hidden={hidden} />
        ) : series.loading ? (
          <Skeleton className="h-80" />
        ) : (
          <EmptyState icon={<Thermometer className="h-6 w-6" />} title="No readings in this period" body="Data appears here as soon as the reefer publishes over MQTT." />
        )}
      </Card>

      {/* ── 6. Lower priority: records & configuration | actions & reference ── */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-4">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'history', label: 'Alert history', count: alerts.data?.rows.length },
                { value: 'rules', label: 'Alert rules' },
                { value: 'data', label: 'Unit data', count: extras.length },
              ]}
            />
          </div>
          {tab === 'history' && (
            <Card bodyClass="p-0">
              {alerts.data?.rows.length ? (
                <ul className="divide-y">
                  {alerts.data.rows.slice(0, historyLimit).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                      <SeverityBadge severity={a.severity} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{a.title}</div>
                        <div className="text-xs text-slate-500">{a.message}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {fmtDateTime(a.triggeredAt)}
                          {a.status === 'acknowledged' && ` · acknowledged by ${a.acknowledgedBy}`}
                          {a.status === 'resolved' && ` · resolved ${timeAgo(a.resolvedAt)}`}
                        </div>
                      </div>
                      {a.status === 'resolved' ? (
                        <Badge>Resolved</Badge>
                      ) : (
                        <Badge className={a.status === 'active' ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30' : undefined}>
                          {a.status === 'active' ? 'Open' : 'Acknowledged'}
                        </Badge>
                      )}
                    </li>
                  ))}
                  {alerts.data.rows.length > historyLimit && (
                    <li className="px-5 py-3">
                      <Button size="sm" variant="ghost" onClick={() => setHistoryLimit(historyLimit + 20)}>
                        Show more ({alerts.data.rows.length - historyLimit} older)
                      </Button>
                    </li>
                  )}
                </ul>
              ) : (
                <EmptyState icon={<CircleCheck className="h-6 w-6" />} title="No alerts yet" body="This reefer hasn't triggered any alerts." />
              )}
            </Card>
          )}
          {tab === 'rules' && (
            <ReeferRulesCard
              reeferId={r.id}
              onChanged={() => {
                detail.refresh();
                alerts.refresh();
              }}
            />
          )}
          {tab === 'data' && (
            <Card title="Other data from the unit" subtitle="Payload fields that aren't standard readings — exactly as the gateway sends them">
              {extras.length ? (
                <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  {extras.map(([k, v]) => (
                    <div key={k} className="flex min-w-0 justify-between gap-4 border-b border-dashed pb-2">
                      <dt className="truncate font-mono text-xs text-slate-500">{k}</dt>
                      <dd className="truncate text-right font-mono text-xs" title={JSON.stringify(v)}>
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Nothing extra yet.</p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6 xl:pt-[52px]">
          {can('operator') && <ControlCard r={r} onDone={detail.refresh} />}
          <DetailsCard r={r} onToggle={detail.refresh} />
        </div>
      </div>

      {editing && (
        <ReeferForm
          open
          editId={r.id}
          initial={toForm(r, unit)}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            detail.refresh();
          }}
        />
      )}
    </>
  );
}

function DetailsCard({ r, onToggle }: { r: DetailResp; onToggle: () => void }) {
  const can = useCan();
  return (
    <Card title="Reefer details">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
        {(
          [
            ['Device ID', <span key="d" className="font-mono">{r.deviceId}</span>],
            ['Brand / model', [r.brand, r.model].filter(Boolean).join(' ') || '—'],
            [
              'Tags',
              r.tags ? (
                <span key="t" className="flex flex-wrap justify-end gap-1">
                  {r.tags.split(',').map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </span>
              ) : (
                '—'
              ),
            ],
          ] as [string, React.ReactNode][]
        ).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
            <dd className="min-w-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {r.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">{r.notes}</p>}
      {can('operator') && (
        <div className="mt-4 border-t pt-4">
          <Switch
            checked={r.active}
            label="Monitoring active"
            description="Paused reefers are ignored by alerts and hidden from the dashboard."
            onChange={async (active) => {
              await api(`/api/reefers/${r.id}`, { method: 'PATCH', body: { active } });
              onToggle();
            }}
          />
        </div>
      )}
    </Card>
  );
}

function ControlCard({ r, onDone }: { r: DetailResp; onDone: () => void }) {
  const { unit, fmt } = useTemp();
  const { toast, confirm } = useFeedback();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (body: { type: 'setpoint'; value: number } | { type: 'power'; value: 'on' | 'off' }, label: string) => {
    if (!(await confirm({ title: `${label}?`, body: `A command will be published to ${r.containerNo} over MQTT.`, confirmLabel: 'Send command' }))) return;
    setBusy(true);
    try {
      const res = await api<{ topic: string }>(`/api/reefers/${r.id}/command`, { body });
      toast({ tone: 'success', title: 'Command sent', body: `Published to ${res.topic}` });
      setValue('');
    } catch (e) {
      toast({ tone: 'error', title: 'Command failed', body: (e as Error).message });
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <Card title="Remote control" subtitle="Sent to the unit over MQTT · every command is logged">
      <label className="label">Change set point (°{unit})</label>
      <div className="flex gap-2">
        <input
          className="input tabular"
          type="number"
          step="0.5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={r.setTemp === null ? '' : `now ${String(fmt(r.setTemp)).split(' ')[0]}`}
        />
        <Button
          icon={<Send className="h-4 w-4" />}
          loading={busy}
          disabled={value === ''}
          onClick={() => send({ type: 'setpoint', value: Math.round(fromUnit(Number(value), unit) * 10) / 10 }, `Change set point to ${value} °${unit}`)}
        >
          Send
        </Button>
      </div>
      <div className="mt-3">
        {r.powerOn === false ? (
          <Button className="w-full" icon={<Power className="h-4 w-4" />} onClick={() => send({ type: 'power', value: 'on' }, 'Power on')}>
            Power on
          </Button>
        ) : (
          <Button className="w-full" variant="secondary" icon={<PowerOff className="h-4 w-4" />} onClick={() => send({ type: 'power', value: 'off' }, 'Power off')}>
            Power off
          </Button>
        )}
      </div>
      {r.commands.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Recent commands</div>
          <ul className="space-y-2 text-xs">
            {r.commands.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  {c.type === 'setpoint' ? `Set point → ${fmt(Number(c.value))}` : `Power ${c.value}`}
                  <span className="text-slate-400"> · {c.createdBy}</span>
                </span>
                <span className={clsx(c.status === 'sent' ? 'text-emerald-600' : 'text-red-600')} title={c.error ?? undefined}>
                  {c.status} · {timeAgo(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
