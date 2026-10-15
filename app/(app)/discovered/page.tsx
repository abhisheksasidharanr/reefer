'use client';

import { Code2, EyeOff, Plus, Radar, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCan, useLive } from '@/components/providers';
import { emptyReefer, ReeferForm } from '@/components/reefer-bits';
import { Badge, Button, Card, EmptyState, fmtDateTime, PageHeader, Skeleton, Switch, timeAgo, useFeedback } from '@/components/ui';
import { api, useData } from '@/lib/client';

interface Device {
  deviceId: string;
  topic: string;
  firstSeenAt: string;
  lastSeenAt: string;
  messages: number;
  lastPayload: string;
  ignored: boolean;
}

export default function DiscoveredPage() {
  const router = useRouter();
  const can = useCan();
  const { toast } = useFeedback();
  const [showIgnored, setShowIgnored] = useState(false);
  const { data, loading, refresh } = useData<Device[]>(`/api/discovered${showIgnored ? '?ignored=1' : ''}`);
  const [registering, setRegistering] = useState<Device | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  useLive(['message'], (_e, m) => {
    if ((m as { result: string }).result === 'discovered') refresh();
  }, 3000);

  const act = async (d: Device, action: 'ignore' | 'unignore' | 'delete') => {
    await api('/api/discovered', { body: { deviceId: d.deviceId, action } });
    toast({ tone: 'success', title: action === 'delete' ? 'Removed' : action === 'ignore' ? 'Device ignored' : 'Device restored', body: d.deviceId });
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Discovered devices"
        description="Units publishing on MQTT that aren't registered yet. Register them in one click — or turn on auto-registration in Settings."
        actions={<Switch checked={showIgnored} onChange={setShowIgnored} label="Show ignored" />}
      />

      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : !data?.length ? (
        <div className="card">
          <EmptyState
            icon={<Radar className="h-6 w-6" />}
            title="No unregistered devices"
            body={
              <>
                Every device on the broker is registered. New ones appear here automatically. Check the{' '}
                <Link href="/settings?tab=mqtt" className="text-brand-600 hover:underline">
                  MQTT inspector
                </Link>{' '}
                to see raw traffic.
              </>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((d) => {
            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(d.lastPayload);
            } catch {
              /* ignore */
            }
            const preview = Object.entries(payload).slice(0, 6);
            return (
              <Card
                key={d.deviceId}
                title={<span className="font-mono">{d.deviceId}</span>}
                subtitle={`${d.messages.toLocaleString()} message${d.messages === 1 ? '' : 's'} · last ${timeAgo(d.lastSeenAt)}`}
                actions={d.ignored && <Badge>Ignored</Badge>}
              >
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                  {preview.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="truncate font-mono text-slate-400">{k}</dt>
                      <dd className="truncate font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 text-xs text-slate-500">
                  Topic <span className="font-mono">{d.topic}</span> · first seen {fmtDateTime(d.firstSeenAt)}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {can('operator') && (
                    <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setRegistering(d)}>
                      Register
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" icon={<Code2 className="h-3.5 w-3.5" />} onClick={() => setRaw(JSON.stringify(payload, null, 2))}>
                    Raw payload
                  </Button>
                  {can('operator') && (
                    <>
                      <Button size="sm" variant="ghost" icon={<EyeOff className="h-3.5 w-3.5" />} onClick={() => act(d, d.ignored ? 'unignore' : 'ignore')}>
                        {d.ignored ? 'Restore' : 'Ignore'}
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => act(d, 'delete')}>
                        Remove
                      </Button>
                    </>
                  )}
                </div>
                {raw && raw === JSON.stringify(payload, null, 2) && (
                  <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-100">{raw}</pre>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {registering && (
        <ReeferForm
          open
          title={`Register ${registering.deviceId}`}
          initial={emptyReefer({ containerNo: registering.deviceId.slice(0, 20), deviceId: registering.deviceId })}
          onClose={() => setRegistering(null)}
          onSaved={(r) => router.push(`/reefers/${r.id}`)}
        />
      )}
    </>
  );
}
