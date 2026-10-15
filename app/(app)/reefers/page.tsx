'use client';

import clsx from 'clsx';
import { Bell, Container, LayoutGrid, List, Plus, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useCan, useLive, useTemp } from '@/components/providers';
import { emptyReefer, ReeferForm, ReeferRow, ReeferTile } from '@/components/reefer-bits';
import { Badge, Button, EmptyState, PageHeader, Segmented, Skeleton, StatusPill, timeAgo } from '@/components/ui';
import { useData } from '@/lib/client';
import { STATUS_META, ReeferStatus } from '@/lib/status';

function ReefersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const { fmt } = useTemp();
  const { data, loading, refresh } = useData<ReeferRow[]>('/api/reefers');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ReeferStatus | ''>('');
  const [tag, setTag] = useState('');
  const [view, setViewState] = useState<'table' | 'grid'>('grid');
  // Grid is the default; remember if the user switches to the table.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rm-reefer-view');
      if (saved === 'table' || saved === 'grid') setViewState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setView = (v: 'table' | 'grid') => {
    setViewState(v);
    try {
      localStorage.setItem('rm-reefer-view', v);
    } catch {
      /* ignore */
    }
  };
  const [creating, setCreating] = useState(false);
  useLive(['reading', 'alert'], () => refresh(), 3000);

  // ?new=1 (e.g. "Register reefer" on the dashboard) opens the form once; the param is removed right away
  // so closing the form can't be undone by a re-render that still sees the old URL.
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || params.get('new') !== '1' || !can('operator')) return;
    openedFromUrl.current = true;
    setCreating(true);
    router.replace('/reefers');
  }, [params, can, router]);

  const tags = useMemo(() => [...new Set((data ?? []).flatMap((r) => r.tags.split(',').map((t) => t.trim()).filter(Boolean)))].sort(), [data]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => !s || [r.containerNo, r.deviceId, r.name, r.brand, r.model, r.tags].some((v) => v?.toLowerCase().includes(s)))
      .filter((r) => !status || r.status === status)
      .filter((r) => !tag || r.tags.split(',').map((t) => t.trim()).includes(tag))
      .sort((a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order || a.containerNo.localeCompare(b.containerNo));
  }, [data, q, status, tag]);

  const counts = useMemo(() => {
    const c: Partial<Record<ReeferStatus, number>> = {};
    for (const r of data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [data]);

  return (
    <>
      <PageHeader
        title="Reefers"
        description={`${data?.length ?? 0} registered · positions are not tracked, telemetry arrives over MQTT`}
        actions={can('operator') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Register reefer</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Container, name, brand, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setStatus('')} className={clsx('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset', !status ? 'bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900' : 'ring-slate-300 text-slate-600 dark:ring-slate-700 dark:text-slate-300')}>
            All {data?.length ?? ''}
          </button>
          {(Object.keys(STATUS_META) as ReeferStatus[])
            .filter((s) => counts[s])
            .map((s) => (
              <button
                key={s}
                onClick={() => setStatus(status === s ? '' : s)}
                className={clsx('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset', status === s ? STATUS_META[s].tone : 'ring-slate-300 text-slate-600 dark:ring-slate-700 dark:text-slate-300')}
              >
                <span className={clsx('h-1.5 w-1.5 rounded-full', STATUS_META[s].dot)} />
                {STATUS_META[s].label} {counts[s]}
              </button>
            ))}
        </div>
        {tags.length > 0 && (
          <select className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
        <div className="ml-auto">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: <LayoutGrid className="h-4 w-4" /> },
              { value: 'table', label: <List className="h-4 w-4" /> },
            ]}
          />
        </div>
      </div>

      {loading && !data ? (
        <Skeleton className="h-96" />
      ) : !rows.length ? (
        <div className="card">
          <EmptyState
            icon={<Container className="h-6 w-6" />}
            title={data?.length ? 'No reefers match your filters' : 'No reefers registered'}
            body={data?.length ? 'Try a different search or filter.' : 'Register a reefer with its container number. Its live data starts flowing as soon as the gateway publishes.'}
            action={!data?.length && can('operator') && <Button onClick={() => setCreating(true)}>Register reefer</Button>}
          />
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rows.map((r) => (
            <ReeferTile key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Reefer</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Supply</th>
                  <th className="px-3 py-3 text-right">Set point</th>
                  <th className="px-3 py-3 text-right">Return</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Tags</th>
                  <th className="px-3 py-3">Last seen</th>
                  <th className="px-5 py-3 text-right">Alerts</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/reefers/${r.id}`)} className={clsx('cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/40', !r.active && 'opacity-60')}>
                    <td className="px-5 py-3">
                      <div className="font-mono font-medium">{r.containerNo}</div>
                      <div className="text-xs text-slate-500">{r.name ?? '—'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="tabular px-3 py-3 text-right font-medium">{fmt(r.supplyTemp)}</td>
                    <td className="tabular px-3 py-3 text-right text-slate-600 dark:text-slate-300">{fmt(r.setTemp ?? r.targetTemp)}</td>
                    <td className="tabular px-3 py-3 text-right text-slate-600 dark:text-slate-300">{fmt(r.returnTemp)}</td>
                    <td className="px-3 py-3">
                      <div>{r.brand ?? '—'}</div>
                      <div className="text-xs text-slate-500">{r.model}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.tags
                          .split(',')
                          .filter(Boolean)
                          .map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">{timeAgo(r.lastSeenAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {r.openAlerts > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Bell className="h-3.5 w-3.5" />
                          {r.openAlerts}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <ReeferForm
          open
          initial={emptyReefer()}
          onClose={() => setCreating(false)}
          onSaved={(r) => router.push(`/reefers/${r.id}`)}
        />
      )}
    </>
  );
}

export default function ReefersPage() {
  return (
    <Suspense>
      <ReefersInner />
    </Suspense>
  );
}
