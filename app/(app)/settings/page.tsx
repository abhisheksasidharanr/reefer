'use client';

import clsx from 'clsx';
import { CheckCircle2, FlaskConical, Pause, Play, Plug, Plus, RefreshCw, Save, Send, Trash2, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useCan, useLive, useMe } from '@/components/providers';
import { Badge, Button, Card, EmptyState, Field, fmtDateTime, Modal, PageHeader, Segmented, Skeleton, Switch, Tabs, timeAgo, useFeedback } from '@/components/ui';
import { api, useData } from '@/lib/client';
import type { Telemetry } from '@/lib/mapping';
import { AllSettings, DEFAULTS, MAPPED_FIELDS, SettingsKey } from '@/lib/settings-schema';

type Tab = 'general' | 'mqtt' | 'mapping' | 'notify' | 'users';

function SettingsInner() {
  const can = useCan();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get('tab') as Tab) || 'general';
  const setTab = (t: Tab) => router.replace(`/settings?tab=${t}`);

  if (!can('admin')) return <EmptyState title="Admins only" body="Ask an administrator to change settings." />;

  return (
    <>
      <PageHeader title="Settings" description="Everything about how data comes in, how it is interpreted and who gets warned." />
      <div className="mb-6">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'general', label: 'General' },
            { value: 'mqtt', label: 'MQTT connection' },
            { value: 'mapping', label: 'Payload mapping' },
            { value: 'notify', label: 'Notifications' },
            { value: 'users', label: 'Users' },
          ]}
        />
      </div>
      {tab === 'general' && <GeneralTab />}
      {tab === 'mqtt' && <MqttTab />}
      {tab === 'mapping' && <MappingTab />}
      {tab === 'notify' && <NotifyTab />}
      {tab === 'users' && <UsersTab />}
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}

/** Load + edit + save one settings group. */
function useSettingsForm<K extends SettingsKey>(key: K) {
  const { data, refresh } = useData<AllSettings[K]>(`/api/settings/${key}`);
  const { toast } = useFeedback();
  const { reload } = useMe();
  const [v, setV] = useState<AllSettings[K] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setV(data);
  }, [data]);
  const dirty = !!v && !!data && JSON.stringify(v) !== JSON.stringify(data);
  const set = <F extends keyof AllSettings[K]>(f: F, val: AllSettings[K][F]) => setV((x) => (x ? { ...x, [f]: val } : x));
  const save = async () => {
    if (!v) return;
    setBusy(true);
    try {
      await api(`/api/settings/${key}`, { method: 'PUT', body: v });
      toast({ tone: 'success', title: 'Settings saved' });
      refresh();
      reload();
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { v, set, setV, save, busy, dirty };
}

function SaveBar({ dirty, busy, onSave, onReset }: { dirty: boolean; busy: boolean; onSave: () => void; onReset?: () => void }) {
  return (
    <div className={clsx('sticky bottom-4 z-10 mt-6 flex items-center justify-end gap-2 rounded-2xl border bg-white/90 px-4 py-3 shadow-lift backdrop-blur transition dark:bg-slate-900/90', !dirty && 'pointer-events-none translate-y-2 opacity-0')}>
      <span className="mr-auto text-sm text-slate-500">You have unsaved changes</span>
      {onReset && (
        <Button variant="ghost" onClick={onReset}>
          Discard
        </Button>
      )}
      <Button icon={<Save className="h-4 w-4" />} loading={busy} onClick={onSave}>
        Save changes
      </Button>
    </div>
  );
}

// ───────── General ─────────

function GeneralTab() {
  const { v, set, save, busy, dirty } = useSettingsForm('general');
  if (!v) return <Skeleton className="h-96" />;
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [v.timezone];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Site" subtitle="How the app looks and reads values">
        <div className="grid grid-cols-1 gap-4">
          <Field label="Site name">
            <input className="input" value={v.siteName} onChange={(e) => set('siteName', e.target.value)} />
          </Field>
          <Field label="Temperature unit" hint="Data is stored in °C; this only changes the display and inputs.">
            <Segmented
              value={v.tempUnit}
              onChange={(u) => set('tempUnit', u)}
              options={[
                { value: 'C', label: 'Celsius °C' },
                { value: 'F', label: 'Fahrenheit °F' },
              ]}
            />
          </Field>
          <Field label="Time zone">
            <select className="input" value={v.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Monitoring" subtitle="Defaults used by the warning system">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Offline after (seconds)" hint="No data for this long = offline">
            <input className="input tabular" type="number" min={30} value={v.offlineAfterSec} onChange={(e) => set('offlineAfterSec', Number(e.target.value))} />
          </Field>
          <Field label="Default tolerance (°C)" hint="Used when a reefer has no own tolerance">
            <input className="input tabular" type="number" step="0.1" min={0} value={v.defaultTolerance} onChange={(e) => set('defaultTolerance', Number(e.target.value))} />
          </Field>
          <Field label="Keep readings (days)" hint="Older history is purged hourly">
            <input className="input tabular" type="number" min={1} value={v.retentionDays} onChange={(e) => set('retentionDays', Number(e.target.value))} />
          </Field>
          <Field label="Store a reading every (seconds)" hint="0 = store every message. Live values always update.">
            <input className="input tabular" type="number" min={0} value={v.sampleEverySec} onChange={(e) => set('sampleEverySec', Number(e.target.value))} />
          </Field>
          <div className="sm:col-span-2">
            <Switch
              checked={v.autoRegister}
              onChange={(x) => set('autoRegister', x)}
              label="Auto-register new devices"
              description="Create a reefer automatically for any unknown device ID. When off, new devices wait under “Discovered”."
            />
          </div>
        </div>
      </Card>
      <div className="lg:col-span-2">
        <SaveBar dirty={dirty} busy={busy} onSave={save} />
      </div>
    </div>
  );
}

// ───────── MQTT ─────────

interface Logged {
  at: string;
  topic: string;
  payload: string;
  deviceId: string | null;
  result: string;
  detail?: string;
}
interface MqttInfo {
  status: { mode: string; state: string; detail: string | null; port: number | null; url: string | null; topic: string; clients: number; messages: number; lastMessageAt: string | null; since: string };
  messages: Logged[];
  demo: { enabled: boolean; intervalSec: number; generatingHere: boolean };
}

function MqttTab() {
  const { v, set, save, busy, dirty } = useSettingsForm('mqtt');
  const info = useData<MqttInfo>('/api/mqtt');
  const { toast } = useFeedback();
  const [paused, setPaused] = useState(false);
  const [testing, setTesting] = useState(false);
  useLive(['mqtt', 'message'], () => !paused && info.refresh(), 1000);

  if (!v) return <Skeleton className="h-96" />;
  const s = info.data?.status;
  const ok = s && (s.state === 'listening' || s.state === 'connected');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-6">
        <Card title="Connection" subtitle="Where reefer gateways publish their JSON">
          <div className="grid grid-cols-1 gap-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ['builtin', 'Built-in broker', 'This app is the broker. Point gateways at this server.'],
                  ['external', 'External broker', 'Subscribe to an existing broker (EMQX, Mosquitto, HiveMQ, AWS IoT…).'],
                ] as const
              ).map(([k, title, body]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set('mode', k)}
                  className={clsx('rounded-xl border p-4 text-left transition', v.mode === k ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/10 dark:bg-brand-500/10' : 'hover:border-slate-300')}
                >
                  <div className="font-medium">{title}</div>
                  <div className="mt-1 text-xs text-slate-500">{body}</div>
                </button>
              ))}
            </div>
            {v.mode === 'builtin' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Listen port">
                  <input className="input tabular" type="number" value={v.builtinPort} onChange={(e) => set('builtinPort', Number(e.target.value))} />
                </Field>
                <Field label="Device username" hint="Optional">
                  <input className="input" value={v.builtinUsername} onChange={(e) => set('builtinUsername', e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Device password" hint="Optional">
                  <input className="input" type="password" value={v.builtinPassword} onChange={(e) => set('builtinPassword', e.target.value)} autoComplete="new-password" />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Broker URL" hint="mqtt://host:1883, mqtts://host:8883, wss://host/mqtt" className="sm:col-span-2">
                  <input className="input font-mono" value={v.url} onChange={(e) => set('url', e.target.value)} />
                </Field>
                <Field label="Username">
                  <input className="input" value={v.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Password">
                  <input className="input" type="password" value={v.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
                </Field>
                <Field label="Client ID prefix">
                  <input className="input font-mono" value={v.clientId} onChange={(e) => set('clientId', e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </Card>

        <Card title="Topics" subtitle="MQTT wildcards: + = one level, # = everything below">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Telemetry topic (subscribe)">
              <input className="input font-mono" value={v.topic} onChange={(e) => set('topic', e.target.value)} />
            </Field>
            <Field label="QoS">
              <select className="input" value={v.qos} onChange={(e) => set('qos', Number(e.target.value) as 0 | 1 | 2)}>
                <option value={0}>0 · at most once</option>
                <option value={1}>1 · at least once</option>
                <option value={2}>2 · exactly once</option>
              </select>
            </Field>
            <Field label="Command topic (publish)" hint="{deviceId} is replaced with the reefer's device ID" className="sm:col-span-2">
              <input className="input font-mono" value={v.commandTopic} onChange={(e) => set('commandTopic', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Switch checked={v.commandsEnabled} onChange={(x) => set('commandsEnabled', x)} label="Allow remote commands" description="Set point and power commands from the reefer page." />
            </div>
          </div>
        </Card>
        <Card title="Demo data" subtitle="For demos and testing when no gateway can reach the broker (e.g. shared hosting)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px] sm:items-end">
            <Switch
              checked={v.demoFeed}
              onChange={(x) => set('demoFeed', x)}
              label="Generate demo data"
              description="Adds 6 sample reefers and streams realistic readings for them, plus one unregistered unit for “Discovered”. Includes a temperature excursion, a fault and a unit switching off, so alerts fire too. Set point and power commands work on the sample units."
            />
            <Field label="Every (seconds)">
              <input className="input tabular" type="number" min={2} max={300} value={v.demoIntervalSec} onChange={(e) => set('demoIntervalSec', Number(e.target.value))} disabled={!v.demoFeed} />
            </Field>
          </div>
        </Card>
        <SaveBar dirty={dirty} busy={busy} onSave={save} />
      </div>

      <div className="space-y-6">
        <Card
          title="Status"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plug className="h-3.5 w-3.5" />}
              loading={testing}
              onClick={async () => {
                setTesting(true);
                const r = await api<{ ok: boolean; detail: string }>('/api/settings/test', { body: { type: 'mqtt' } }).catch((e) => ({ ok: false, detail: (e as Error).message }));
                setTesting(false);
                toast({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Connection OK' : 'Connection failed', body: r.detail });
              }}
            >
              Test saved settings
            </Button>
          }
        >
          {s ? (
            <div className="space-y-4">
              <div className={clsx('flex items-center gap-3 rounded-xl p-3', ok ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10')}>
                {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                <div className="text-sm">
                  <div className="font-medium capitalize">
                    {s.mode === 'builtin' ? 'Built-in broker' : 'External broker'} · {s.state}
                  </div>
                  {s.detail && <div className="text-xs text-red-700 dark:text-red-300">{s.detail}</div>}
                </div>
              </div>
              {info.data?.demo.enabled && (
                <div className="flex items-center gap-3 rounded-xl bg-violet-50 p-3 text-sm dark:bg-violet-500/10">
                  <FlaskConical className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300" />
                  <div>
                    <div className="font-medium">Demo data on</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Simulated readings every {info.data.demo.intervalSec} s for the sample reefers.</div>
                  </div>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">{s.mode === 'builtin' ? 'Gateways connected' : 'Broker'}</dt>
                  <dd className="font-medium">{s.mode === 'builtin' ? s.clients : <span className="break-all font-mono text-xs">{s.url}</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Messages since start</dt>
                  <dd className="tabular font-medium">{s.messages.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Last message</dt>
                  <dd className="font-medium">{timeAgo(s.lastMessageAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Subscribed to</dt>
                  <dd className="font-mono text-xs">{s.topic}</dd>
                </div>
              </dl>
              {s.mode === 'builtin' && (
                <div className="rounded-xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
                  <div className="mb-1 text-slate-500"># Point your gateways at</div>
                  <div>
                    mqtt://{host}:{s.port}
                  </div>
                  <div className="mt-2 text-slate-500"># and publish JSON to</div>
                  <div>{s.topic.replace('+', '<DEVICE_ID>').replace('#', 'data')}</div>
                </div>
              )}
            </div>
          ) : (
            <Skeleton className="h-40" />
          )}
        </Card>

        <Card
          title="Live message inspector"
          subtitle="Last 200 messages received"
          actions={
            <Button size="sm" variant="ghost" icon={paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />} onClick={() => setPaused(!paused)}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          }
          bodyClass="p-0"
        >
          <div className="max-h-[520px] divide-y overflow-y-auto">
            {info.data?.messages.length ? (
              info.data.messages.slice(0, 60).map((m, i) => (
                <details key={`${m.at}-${i}`} className="group px-5 py-2.5">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
                    <span
                      className={clsx(
                        'h-2 w-2 shrink-0 rounded-full',
                        m.result === 'ok' || m.result === 'registered' ? 'bg-emerald-500' : m.result === 'discovered' ? 'bg-sky-500' : m.result === 'ignored' ? 'bg-slate-400' : 'bg-red-500',
                      )}
                    />
                    <span className="font-mono font-medium">{m.deviceId ?? '—'}</span>
                    <span className="truncate text-slate-400">{m.topic}</span>
                    <span className="ml-auto shrink-0 text-slate-400">{new Date(m.at).toLocaleTimeString()}</span>
                  </summary>
                  <div className="mt-2 text-xs">
                    <Badge>{m.result}</Badge> {m.detail && <span className="text-red-600">{m.detail}</span>}
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-slate-200">{prettify(m.payload)}</pre>
                  </div>
                </details>
              ))
            ) : (
              <EmptyState title="No messages yet" body="Messages show up here the moment a gateway publishes." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function prettify(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

// ───────── Mapping ─────────

function MappingTab() {
  const { v, set, setV, save, busy, dirty } = useSettingsForm('mapping');
  const info = useData<MqttInfo>('/api/mqtt');
  const [sample, setSample] = useState('');
  const [topic, setTopic] = useState('reefer/MSKU8812340/telemetry');
  const [result, setResult] = useState<{ telemetry: Telemetry; paths: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Use the most recent real message as the sample.
  useEffect(() => {
    const m = info.data?.messages.find((x) => x.result !== 'error');
    if (m && !sample) {
      setSample(prettify(m.payload));
      setTopic(m.topic);
    } else if (info.data && !sample) {
      setSample(
        JSON.stringify(
          { containerNo: 'MSKU8812340', settemp: -18, sstemp: -17.6, rstemp: -16.9, humidity: 78, voltage: 402, current: 11.4, coolerstate: 1, faultcode: 0, workmode: 'chill', worktime: 1260, gps: { lat: 25.01, lng: 55.06 } },
          null,
          2,
        ),
      );
    }
  }, [info.data, sample]);

  useEffect(() => {
    if (!v || !sample) return;
    const t = setTimeout(() => {
      api<{ telemetry: Telemetry; paths: string[] }>('/api/mapping/preview', { body: { mapping: v, payload: sample, topic } })
        .then((r) => {
          setResult(r);
          setErr(null);
        })
        .catch((e) => setErr((e as Error).message));
    }, 300);
    return () => clearTimeout(t);
  }, [v, sample, topic]);

  if (!v) return <Skeleton className="h-96" />;
  const paths = result?.paths ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card
        title="Field mapping"
        subtitle="Tell the app where each value lives in your JSON (dot paths, e.g. data.temp.supply)"
        actions={
          <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setV({ ...DEFAULTS.mapping })}>
            Reset to default
          </Button>
        }
      >
        <div className="space-y-3">
          {MAPPED_FIELDS.map((f) => {
            const val = v[f.key];
            const mapped = result?.telemetry[f.key === 'power' ? 'powerOn' : f.key === 'timestamp' ? 'at' : f.key];
            return (
              <div key={f.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[150px_1fr_130px]">
                <div>
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-[11px] text-slate-400">{f.hint}</div>
                </div>
                <div className="flex gap-1.5">
                  <input className="input font-mono text-xs" value={val} onChange={(e) => set(f.key, e.target.value)} list={`paths-${f.key}`} placeholder="(not used)" />
                  <datalist id={`paths-${f.key}`}>
                    {(f.key === 'deviceId' ? [...paths.map((p) => `payload:${p}`), ...topic.split('/').map((_, i) => `topic:${i}`)] : paths).map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
                <div className={clsx('truncate rounded-md px-2 py-1.5 text-right font-mono text-xs', mapped === null || mapped === undefined ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300')}>
                  {mapped === null || mapped === undefined ? 'no value' : f.key === 'timestamp' ? new Date(mapped as unknown as string).toLocaleTimeString() : String(mapped)}
                </div>
              </div>
            );
          })}
          <div className="border-t pt-4">
            <Switch checked={v.payloadFahrenheit} onChange={(x) => set('payloadFahrenheit', x)} label="Payload temperatures are in °F" description="Converted to °C on arrival." />
          </div>
        </div>
        <SaveBar dirty={dirty} busy={busy} onSave={save} />
      </Card>

      <div className="space-y-6">
        <Card title="Sample message" subtitle="Pre-filled with the latest real message — edit freely to test">
          <Field label="Topic">
            <input className="input font-mono text-xs" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <textarea className="input mt-3 min-h-[280px] font-mono text-xs" value={sample} onChange={(e) => setSample(e.target.value)} spellCheck={false} />
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </Card>
        <Card title="Other fields kept as “extra” data" subtitle="Shown on the reefer page under “Other data from the unit”">
          {result && Object.keys(result.telemetry.extra).length ? (
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(result.telemetry.extra).map((k) => (
                <Badge key={k}>
                  <span className="font-mono">{k}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Every field is mapped.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

// ───────── Notifications ─────────

function NotifyTab() {
  const { v, set, save, busy, dirty } = useSettingsForm('notify');
  const { toast } = useFeedback();
  const [testing, setTesting] = useState<string | null>(null);
  if (!v) return <Skeleton className="h-96" />;

  const test = async (type: 'email' | 'webhook') => {
    if (dirty) return toast({ tone: 'warning', title: 'Save first', body: 'Tests use the saved settings.' });
    setTesting(type);
    const r = await api<{ ok: boolean; detail: string }>('/api/settings/test', { body: { type } }).catch((e) => ({ ok: false, detail: (e as Error).message }));
    setTesting(null);
    toast({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Test sent' : 'Test failed', body: r.detail });
  };

  const sevs = ['info', 'warning', 'critical'] as const;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="In the app" subtitle="Pop-ups, sound and desktop notifications for signed-in users">
        <div className="space-y-4">
          <div>
            <div className="label">Pop up for</div>
            <div className="flex gap-2">
              {sevs.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={v.inAppSeverities.includes(s)}
                    onChange={(e) => set('inAppSeverities', e.target.checked ? [...v.inAppSeverities, s] : v.inAppSeverities.filter((x) => x !== s))}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <Switch checked={v.sound} onChange={(x) => set('sound', x)} label="Play a sound" description="Short chime; critical alerts use a distinct tone." />
        </div>
      </Card>

      <Card
        title="Email"
        subtitle="Used by rules with “Email” turned on"
        actions={
          <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} loading={testing === 'email'} onClick={() => test('email')}>
            Send test
          </Button>
        }
      >
        <div className="space-y-4">
          <Switch checked={v.emailEnabled} onChange={(x) => set('emailEnabled', x)} label="Enable email notifications" />
          <div className={clsx('grid grid-cols-1 gap-4 sm:grid-cols-2', !v.emailEnabled && 'opacity-50')}>
            <Field label="SMTP host">
              <input className="input" value={v.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.office365.com" />
            </Field>
            <Field label="Port">
              <input className="input tabular" type="number" value={v.smtpPort} onChange={(e) => set('smtpPort', Number(e.target.value))} />
            </Field>
            <Field label="Username">
              <input className="input" value={v.smtpUser} onChange={(e) => set('smtpUser', e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={v.smtpPass} onChange={(e) => set('smtpPass', e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="From address">
              <input className="input" value={v.emailFrom} onChange={(e) => set('emailFrom', e.target.value)} />
            </Field>
            <div className="flex items-end pb-1">
              <Switch checked={v.smtpSecure} onChange={(x) => set('smtpSecure', x)} label="TLS (port 465)" />
            </div>
            <Field label="Recipients" hint="Comma separated" className="sm:col-span-2">
              <input className="input" value={v.emailTo} onChange={(e) => set('emailTo', e.target.value)} placeholder="ops@company.com, duty@company.com" />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="Webhook"
        subtitle="POST JSON for every alert event — connect Teams, Slack, SMS gateways or your TOS"
        actions={
          <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} loading={testing === 'webhook'} onClick={() => test('webhook')}>
            Send test
          </Button>
        }
      >
        <div className="space-y-4">
          <Switch checked={v.webhookEnabled} onChange={(x) => set('webhookEnabled', x)} label="Enable webhook" />
          <div className={clsx('grid grid-cols-1 gap-4', !v.webhookEnabled && 'opacity-50')}>
            <Field label="URL">
              <input className="input font-mono text-xs" value={v.webhookUrl} onChange={(e) => set('webhookUrl', e.target.value)} placeholder="https://example.com/hooks/reefer" />
            </Field>
            <Field label="Signing secret" hint="Requests carry X-Signature: sha256=HMAC(body, secret)">
              <input className="input" type="password" value={v.webhookSecret} onChange={(e) => set('webhookSecret', e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        </div>
      </Card>
      <div className="lg:col-span-2">
        <SaveBar dirty={dirty} busy={busy} onSave={save} />
      </div>
    </div>
  );
}

// ───────── Users ─────────

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}

function UsersTab() {
  const { data, refresh } = useData<User[]>('/api/users');
  const { me } = useMe();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<{ id?: number; email: string; name: string; role: string; password: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const roles = useMemo(
    () => [
      ['admin', 'Admin', 'Everything, including settings and users'],
      ['operator', 'Operator', 'Register reefers, handle alerts, send commands'],
      ['viewer', 'Viewer', 'Read-only'],
    ],
    [],
  );

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) await api(`/api/users/${editing.id}`, { method: 'PATCH', body: { name: editing.name, role: editing.role, active: editing.active, password: editing.password } });
      else await api('/api/users', { body: editing });
      toast({ tone: 'success', title: editing.id ? 'User updated' : 'User added' });
      setEditing(null);
      refresh();
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Users"
      subtitle="Who can sign in and what they can do"
      actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ email: '', name: '', role: 'operator', password: '', active: true })}>Add user</Button>}
      bodyClass="p-0"
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-900/60">
          <tr>
            <th className="px-5 py-3">Name</th>
            <th className="px-3 py-3">Role</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Last sign-in</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((u) => (
            <tr key={u.id}>
              <td className="px-5 py-3">
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-slate-500">{u.email}</div>
              </td>
              <td className="px-3 py-3 capitalize">{u.role}</td>
              <td className="px-3 py-3">{u.active ? <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">Active</Badge> : <Badge>Disabled</Badge>}</td>
              <td className="px-3 py-3 text-slate-500">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td>
              <td className="px-5 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: u.id, email: u.email, name: u.name, role: u.role, password: '', active: u.active })}>
                    Edit
                  </Button>
                  {u.id !== me?.uid && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      aria-label="Delete user"
                      onClick={async () => {
                        if (!(await confirm({ title: `Remove ${u.name}?`, confirmLabel: 'Remove', danger: true }))) return;
                        await api(`/api/users/${u.id}`, { method: 'DELETE' }).then(refresh).catch((e) => toast({ tone: 'error', title: 'Could not remove', body: (e as Error).message }));
                      }}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit user' : 'Add user'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-1 gap-4">
            <Field label="Name">
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editing.email} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <div className="grid grid-cols-1 gap-2">
                {roles.map(([k, label, body]) => (
                  <label key={k} className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', editing.role === k && 'border-brand-500 bg-brand-50 dark:bg-brand-500/10')}>
                    <input type="radio" name="role" className="mt-1" checked={editing.role === k} onChange={() => setEditing({ ...editing, role: k })} />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-slate-500">{body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label={editing.id ? 'New password' : 'Password'} hint={editing.id ? 'Leave empty to keep the current password' : 'At least 8 characters'}>
              <input className="input" type="password" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
            </Field>
            {editing.id && <Switch checked={editing.active} onChange={(x) => setEditing({ ...editing, active: x })} label="Account active" />}
          </div>
        )}
      </Modal>
    </Card>
  );
}

