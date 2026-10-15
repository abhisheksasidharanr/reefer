'use client';

import clsx from 'clsx';
import { BellOff, Check, CheckCheck, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCan, useLive } from '@/components/providers';
import { Button, EmptyState, fmtDateTime, Modal, PageHeader, SeverityBadge, Skeleton, Tabs, timeAgo, useFeedback } from '@/components/ui';
import { api, useData } from '@/lib/client';

interface AlertRow {
  id: number;
  severity: string;
  status: string;
  title: string;
  message: string;
  value: number | null;
  triggeredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  note: string | null;
  reefer: { id: number; containerNo: string; name: string | null };
}
interface Resp {
  rows: AlertRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: { status: string; severity: string; n: number }[];
}

type Tab = 'open' | 'active' | 'acknowledged' | 'resolved' | 'all';

export default function AlertsPage() {
  const can = useCan();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<Tab>('open');
  const [severity, setSeverity] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [noteFor, setNoteFor] = useState<'acknowledge' | 'resolve' | null>(null);
  const [note, setNote] = useState('');

  const url = `/api/alerts?status=${tab}&severity=${severity}&q=${encodeURIComponent(query)}&page=${page}`;
  const { data, loading, refresh } = useData<Resp>(url);
  useLive(['alert'], () => refresh(), 1500);
  useEffect(() => setSelected(new Set()), [url]);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const count = (st: string[]) => (data?.counts ?? []).filter((c) => st.includes(c.status)).reduce((s, c) => s + c.n, 0);
  const rows = data?.rows ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const run = async (ids: number[], action: 'acknowledge' | 'resolve' | 'reopen', withNote?: string) => {
    try {
      const r = await api<{ updated: number }>('/api/alerts', { body: { ids, action, note: withNote || undefined } });
      toast({ tone: 'success', title: `${r.updated} alert${r.updated === 1 ? '' : 's'} ${action === 'acknowledge' ? 'acknowledged' : action === 'resolve' ? 'resolved' : 'reopened'}` });
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast({ tone: 'error', title: 'Action failed', body: (e as Error).message });
    }
  };

  return (
    <>
      <PageHeader title="Alerts" description="Everything the warning system has raised. Acknowledge to stop reminders; resolve when handled." />

      <div className="card overflow-hidden">
        <div className="px-5 pt-2">
          <Tabs
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            tabs={[
              { value: 'open', label: 'Open', count: count(['active', 'acknowledged']) },
              { value: 'active', label: 'Unacknowledged', count: count(['active']) },
              { value: 'acknowledged', label: 'Acknowledged', count: count(['acknowledged']) },
              { value: 'resolved', label: 'Resolved' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search alert or container…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select
            className="input w-auto"
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setPage(1);
            }}
            aria-label="Severity"
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          {selected.size > 0 && can('operator') && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-slate-500">{selected.size} selected</span>
              {tab !== 'resolved' && (
                <>
                  <Button size="sm" variant="secondary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setNoteFor('acknowledge')}>
                    Acknowledge
                  </Button>
                  <Button size="sm" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => setNoteFor('resolve')}>
                    Resolve
                  </Button>
                </>
              )}
              {tab === 'resolved' && (
                <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => run([...selected], 'reopen')}>
                  Reopen
                </Button>
              )}
            </div>
          )}
        </div>

        {loading && !data ? (
          <div className="p-5">
            <Skeleton className="h-64" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<BellOff className="h-6 w-6" />} title={tab === 'open' ? 'No open alerts' : 'Nothing here'} body={tab === 'open' ? 'Your fleet is within all configured limits.' : 'No alerts match these filters.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  {can('operator') && (
                    <th className="w-10 px-5 py-3">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                        aria-label="Select all"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                    </th>
                  )}
                  <th className="px-3 py-3">Severity</th>
                  <th className="px-3 py-3">Alert</th>
                  <th className="px-3 py-3">Reefer</th>
                  <th className="px-3 py-3">Triggered</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((a) => (
                  <tr key={a.id} className={clsx('align-top transition hover:bg-slate-50 dark:hover:bg-slate-800/40', selected.has(a.id) && 'bg-brand-50/50 dark:bg-brand-500/5')}>
                    {can('operator') && (
                      <td className="px-5 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => {
                            const n = new Set(selected);
                            n.has(a.id) ? n.delete(a.id) : n.add(a.id);
                            setSelected(n);
                          }}
                          aria-label={`Select alert ${a.id}`}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                      </td>
                    )}
                    <td className="px-3 py-3.5">
                      <SeverityBadge severity={a.severity} />
                    </td>
                    <td className="max-w-md px-3 py-3.5">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-slate-500">{a.message}</div>
                      {a.note && <div className="mt-1 text-xs italic text-slate-500">“{a.note}”</div>}
                    </td>
                    <td className="px-3 py-3.5">
                      <Link href={`/reefers/${a.reefer.id}`} className="font-mono font-medium text-brand-700 hover:underline dark:text-brand-300">
                        {a.reefer.containerNo}
                      </Link>
                      <div className="text-xs text-slate-500">{a.reefer.name}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <div>{timeAgo(a.triggeredAt)}</div>
                      <div className="text-xs text-slate-400">{fmtDateTime(a.triggeredAt)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-xs">
                      {a.status === 'active' && <span className="font-medium text-red-600 dark:text-red-400">Unacknowledged</span>}
                      {a.status === 'acknowledged' && (
                        <span className="text-amber-700 dark:text-amber-300">
                          Acknowledged
                          <br />
                          <span className="text-slate-400">by {a.acknowledgedBy}</span>
                        </span>
                      )}
                      {a.status === 'resolved' && (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          Resolved
                          <br />
                          <span className="text-slate-400">by {a.resolvedBy} · {timeAgo(a.resolvedAt)}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {can('operator') && (
                        <div className="flex justify-end gap-1.5">
                          {a.status === 'active' && (
                            <Button size="sm" variant="secondary" onClick={() => run([a.id], 'acknowledge')}>
                              Ack
                            </Button>
                          )}
                          {a.status !== 'resolved' && (
                            <Button size="sm" variant="soft" onClick={() => run([a.id], 'resolve')}>
                              Resolve
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-slate-500">
            <span>
              {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!noteFor}
        size="sm"
        onClose={() => setNoteFor(null)}
        title={noteFor === 'acknowledge' ? `Acknowledge ${selected.size} alert(s)` : `Resolve ${selected.size} alert(s)`}
        description="Optionally leave a note for the team."
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await run([...selected], noteFor!, note);
                setNoteFor(null);
                setNote('');
              }}
            >
              {noteFor === 'acknowledge' ? 'Acknowledge' : 'Resolve'}
            </Button>
          </>
        }
      >
        <textarea className="input min-h-[90px]" placeholder="e.g. Technician dispatched, door was left open" value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </>
  );
}
