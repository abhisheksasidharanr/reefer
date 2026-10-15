'use client';

import clsx from 'clsx';
import { Box, RotateCw, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import type { Fleet3DHandle, FleetItem, Preset } from '@/components/fleet-3d';
import { useLive, useTemp } from '@/components/providers';
import type { ReeferRow } from '@/components/reefer-bits';
import { Button, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { useData } from '@/lib/client';
import { deviationColor } from '@/lib/layout3d';
import { STATUS_META, ReeferStatus } from '@/lib/status';

const Fleet3D = dynamic(() => import('@/components/fleet-3d').then((m) => m.Fleet3D), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const STATUS_COLOR: Record<ReeferStatus, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  offline: '#64748b',
  off: '#8b5cf6',
  ok: '#10b981',
  never: '#38bdf8',
  inactive: '#cbd5e1',
};

const TEMP_LEGEND = [
  ['#1d4ed8', 'Much too cold'],
  ['#3b82f6', 'Too cold'],
  ['#14b8a6', 'Within tolerance'],
  ['#f59e0b', 'Slightly warm'],
  ['#f97316', 'Warm'],
  ['#ef4444', 'Too warm'],
  ['#94a3b8', 'No reading'],
] as const;

export default function FleetPage() {
  const router = useRouter();
  const { fmt } = useTemp();
  const { data, loading, refresh } = useData<ReeferRow[]>('/api/reefers');
  useLive(['reading', 'alert'], () => refresh(), 3000);
  const [groupBy, setGroupBy] = useState<'status' | 'tag' | 'none'>('status');
  const [colorBy, setColorBy] = useState<'status' | 'temp'>('status');
  const [q, setQ] = useState('');
  const [rotate, setRotate] = useState(false);
  const viz = useRef<Fleet3DHandle | null>(null);

  const items: FleetItem[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => r.active)
      .sort((a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order || a.containerNo.localeCompare(b.containerNo))
      .map((r) => {
        const sp = r.setTemp ?? r.targetTemp;
        const dev = sp !== null && r.supplyTemp !== null && r.status !== 'offline' ? r.supplyTemp - sp : null;
        const tag = r.tags.split(',').map((t) => t.trim()).filter(Boolean)[0] ?? 'untagged';
        const group = groupBy === 'status' ? r.status : groupBy === 'tag' ? tag : 'all';
        const groupLabel = groupBy === 'status' ? STATUS_META[r.status].label : groupBy === 'tag' ? tag : 'All reefers';
        return {
          id: r.id,
          containerNo: r.containerNo,
          group,
          groupLabel,
          color: colorBy === 'status' ? STATUS_COLOR[r.status] : deviationColor(dev, r.tolerance ?? 2),
          beacon: r.status === 'critical' ? 'critical' : r.status === 'warning' ? 'warning' : null,
          dim: !!s && ![r.containerNo, r.name, r.tags, r.brand].some((v) => v?.toLowerCase().includes(s)),
          tooltip: {
            title: r.containerNo,
            lines: [
              r.name ?? '',
              `${STATUS_META[r.status].label}${r.openAlerts ? ` · ${r.openAlerts} alert${r.openAlerts === 1 ? '' : 's'}` : ''}`,
              `Supply ${fmt(r.supplyTemp)} · set ${fmt(sp)}`,
              dev === null ? '' : `Deviation ${dev >= 0 ? '+' : '−'}${fmt(Math.abs(dev), true)}`,
            ].filter(Boolean),
          },
        };
      });
  }, [data, groupBy, colorBy, q, fmt]);

  const matches = q.trim() ? items.filter((i) => !i.dim).length : null;

  return (
    <>
      <PageHeader
        title="3D view"
        description="Your fleet laid out automatically — reefers have no fixed position, so they are grouped into lanes. Hover for details, click to open."
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input w-56 pl-9" placeholder="Highlight container…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Group
            <Segmented
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: 'status', label: 'Status' },
                { value: 'tag', label: 'Tag' },
                { value: 'none', label: 'None' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Colour
            <Segmented
              value={colorBy}
              onChange={setColorBy}
              options={[
                { value: 'status', label: 'Status' },
                { value: 'temp', label: 'Temperature' },
              ]}
            />
          </div>
          {matches !== null && <span className="text-xs text-slate-500">{matches} match{matches === 1 ? '' : 'es'}</span>}
          <div className="ml-auto flex flex-wrap gap-1.5">
            {(['iso', 'top', 'front'] as Preset[]).map((p) => (
              <Button key={p} size="sm" variant="secondary" onClick={() => viz.current?.preset(p)}>
                {p === 'iso' ? 'Perspective' : p === 'top' ? 'Top' : 'Front'}
              </Button>
            ))}
            <Button size="sm" variant={rotate ? 'primary' : 'secondary'} icon={<RotateCw className="h-3.5 w-3.5" />} onClick={() => setRotate(!rotate)}>
              Rotate
            </Button>
          </div>
        </div>

        <div className="relative h-[min(72vh,760px)] min-h-[420px] bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950">
          {loading && !data ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : items.length === 0 ? (
            <EmptyState icon={<Box className="h-6 w-6" />} title="No active reefers" body="Register reefers to see them in 3D." />
          ) : (
            <Fleet3D controller={viz} items={items} onOpen={(id) => router.push(`/reefers/${id}`)} autoRotate={rotate} />
          )}

          <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-xl sm:block bg-white/90 p-3 text-xs shadow-lift ring-1 ring-slate-200 backdrop-blur dark:bg-slate-900/90 dark:ring-slate-700">
            <div className="mb-1.5 font-semibold">{colorBy === 'status' ? 'Status' : 'Supply vs set point'}</div>
            <div className="grid grid-cols-1 gap-1">
              {(colorBy === 'status'
                ? (Object.keys(STATUS_COLOR) as ReeferStatus[]).filter((s) => s !== 'inactive').map((s) => [STATUS_COLOR[s], STATUS_META[s].label] as const)
                : TEMP_LEGEND
              ).map(([c, label]) => (
                <span key={label} className="flex items-center gap-2">
                  <span className={clsx('h-2.5 w-4 rounded-sm')} style={{ background: c }} />
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-slate-400">Drag to orbit · scroll to zoom · right-drag to pan</div>
          </div>
        </div>
        {/* Compact legend for small screens */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-4 py-2.5 text-[11px] text-slate-500 sm:hidden">
          {(colorBy === 'status'
            ? (Object.keys(STATUS_COLOR) as ReeferStatus[]).filter((s) => s !== 'inactive').map((s) => [STATUS_COLOR[s], STATUS_META[s].label] as const)
            : TEMP_LEGEND
          ).map(([c, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: c }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
