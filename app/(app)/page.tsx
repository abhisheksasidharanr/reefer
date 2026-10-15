'use client';

import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Box, Container, PlugZap, Radar, Signal, Thermometer, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLive, useTemp } from '@/components/providers';
import { ReeferRow, ReeferTile } from '@/components/reefer-bits';
import { Button, Card, EmptyState, PageHeader, Segmented, SeverityBadge, Skeleton, Stat, timeAgo } from '@/components/ui';
import { useData } from '@/lib/client';
import { STATUS_META, ReeferStatus } from '@/lib/status';

interface Dashboard {
  kpi: { total: number; online: number; critical: number; warning: number; offline: number; off: number; avgSupply: number | null; openAlerts: number; unacked: number; discovered: number };
  reefers: (ReeferRow & { spark: number[] })[];
  alerts: { id: number; severity: string; status: string; title: string; triggeredAt: string; reefer: { id: number; containerNo: string; name: string | null } }[];
  mqtt: { state: string; mode: string; clients: number; lastMessageAt: string | null };
}

export default function DashboardPage() {
  const { data, loading, refresh } = useData<Dashboard>('/api/dashboard');
  const { fmt } = useTemp();
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  useLive(['reading', 'alert'], () => refresh(), 3000);

  const reefers = useMemo(() => {
    const rows = [...(data?.reefers ?? [])].sort((a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order || a.containerNo.localeCompare(b.containerNo));
    return filter === 'attention' ? rows.filter((r) => ['critical', 'warning', 'offline', 'off'].includes(r.status)) : rows;
  }, [data, filter]);

  const k = data?.kpi;
  const segments: ReeferStatus[] = ['critical', 'warning', 'off', 'offline', 'never', 'ok'];

  return (
    <>
      <PageHeader
        title="Fleet overview"
        description={data?.mqtt.lastMessageAt ? `Last telemetry ${timeAgo(data.mqtt.lastMessageAt)}` : 'Waiting for telemetry…'}
        actions={
          <>
            <Link href="/fleet">
              <Button variant="secondary" icon={<Box className="h-4 w-4" />}>
                3D view
              </Button>
            </Link>
            <Link href="/reefers?new=1">
              <Button icon={<Container className="h-4 w-4" />}>Register reefer</Button>
            </Link>
          </>
        }
      />

      {k && k.discovered > 0 && (
        <Link href="/discovered" className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-sky-600 px-5 py-4 text-white shadow-lg shadow-brand-600/20 transition hover:opacity-95">
          <Radar className="h-5 w-5" />
          <span className="text-sm">
            <b>{k.discovered}</b> new device{k.discovered === 1 ? ' is' : 's are'} sending data but not registered yet.
          </span>
          <ArrowRight className="ml-auto h-4 w-4" />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px]" />)
        ) : (
          <>
            <Stat label="Reefers online" value={`${k?.online ?? 0} / ${k?.total ?? 0}`} sub={`${k?.offline ?? 0} offline · ${k?.off ?? 0} powered off`} icon={<Signal className="h-5 w-5" />} tone="brand" />
            <Stat label="Critical" value={k?.critical ?? 0} sub="reefers with critical alerts" icon={<AlertTriangle className="h-5 w-5" />} tone={k?.critical ? 'red' : 'slate'} />
            <Stat label="Open alerts" value={k?.openAlerts ?? 0} sub={`${k?.unacked ?? 0} not acknowledged`} icon={<PlugZap className="h-5 w-5" />} tone={k?.unacked ? 'amber' : 'slate'} />
            <Stat label="Avg supply air" value={fmt(k?.avgSupply)} sub="across reporting reefers" icon={<Thermometer className="h-5 w-5" />} tone="emerald" />
          </>
        )}
      </div>

      {k && k.total > 0 && (
        <div className="card mt-6 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Fleet health</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {segments.map((s) => {
                const n = data!.reefers.filter((r) => r.status === s).length;
                return n ? (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className={clsx('h-2 w-2 rounded-full', STATUS_META[s].dot)} />
                    {STATUS_META[s].label} {n}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            {segments.map((s) => {
              const n = data!.reefers.filter((r) => r.status === s).length;
              return n ? <div key={s} className={clsx('h-full transition-all', STATUS_META[s].dot)} style={{ width: `${(n / k.total) * 100}%` }} title={`${STATUS_META[s].label}: ${n}`} /> : null;
            })}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Reefers</h2>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'attention', label: 'Needs attention' },
              ]}
            />
          </div>
          {loading && !data ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : reefers.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {reefers.map((r) => (
                <ReeferTile key={r.id} r={r} />
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState
                icon={filter === 'attention' ? <Signal className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
                title={filter === 'attention' ? 'All clear' : 'No reefers yet'}
                body={filter === 'attention' ? 'Every reefer is reporting normally.' : 'Register your first reefer — its readings will appear here as soon as it publishes over MQTT.'}
                action={
                  filter === 'all' && (
                    <Link href="/reefers?new=1">
                      <Button>Register reefer</Button>
                    </Link>
                  )
                }
              />
            </div>
          )}
        </div>

        <Card
          title="Open alerts"
          actions={
            <Link href="/alerts" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              View all
            </Link>
          }
          bodyClass="p-0"
          className="h-fit"
        >
          {data?.alerts.length ? (
            <ul className="divide-y">
              {data.alerts.map((a) => (
                <li key={a.id}>
                  <Link href={`/reefers/${a.reefer.id}`} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{a.reefer.containerNo}</span>
                        {a.status === 'acknowledged' && <span className="text-[10px] uppercase tracking-wide text-slate-400">ack</span>}
                      </div>
                      <div className="truncate text-sm text-slate-600 dark:text-slate-300">{a.title}</div>
                      <div className="text-xs text-slate-400">{timeAgo(a.triggeredAt)}</div>
                    </div>
                    <SeverityBadge severity={a.severity} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Signal className="h-6 w-6" />} title="No open alerts" body="You'll see new alerts here instantly." />
          )}
        </Card>
      </div>
    </>
  );
}
