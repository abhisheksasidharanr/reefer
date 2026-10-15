'use client';

import clsx from 'clsx';
import { Bell, Clock, Power, Thermometer, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fromUnit, toUnit } from '@/lib/units';
import type { ReeferStatus } from '@/lib/status';
import { useTemp } from './providers';
import { Button, Field, SlideOver, Sparkline, StatusPill, timeAgo, useFeedback } from './ui';

export interface ReeferRow {
  id: number;
  containerNo: string;
  deviceId: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  targetTemp: number | null;
  tolerance: number | null;
  tags: string;
  notes: string | null;
  active: boolean;
  lastSeenAt: string | null;
  setTemp: number | null;
  supplyTemp: number | null;
  returnTemp: number | null;
  humidity: number | null;
  voltage: number | null;
  current: number | null;
  powerOn: boolean | null;
  faultCode: number | null;
  mode: string | null;
  status: ReeferStatus;
  openAlerts: number;
  unacked: number;
  spark?: number[];
}

const RING: Record<ReeferStatus, string> = {
  critical: 'ring-2 ring-red-500/50',
  warning: 'ring-2 ring-amber-400/50',
  offline: '',
  off: '',
  ok: '',
  never: '',
  inactive: 'opacity-60',
};
const SPARK: Record<ReeferStatus, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  offline: '#94a3b8',
  off: '#8b5cf6',
  ok: '#06b6d4',
  never: '#94a3b8',
  inactive: '#cbd5e1',
};

export function ReeferTile({ r }: { r: ReeferRow }) {
  const { fmt } = useTemp();
  const sp = r.setTemp ?? r.targetTemp;
  const dev = sp !== null && r.supplyTemp !== null ? r.supplyTemp - sp : null;
  return (
    <Link href={`/reefers/${r.id}`} className={clsx('card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift', RING[r.status])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold">{r.containerNo}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{r.name ?? ([r.brand, r.model].filter(Boolean).join(' ') || '—')}</div>
        </div>
        <StatusPill status={r.status} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="tabular text-3xl font-semibold tracking-tight">{r.supplyTemp === null ? '—' : fmt(r.supplyTemp).replace(/ °.$/, '')}<span className="ml-1 text-base font-normal text-slate-400">{fmt(0).slice(-2)}</span></div>
          <div className="text-xs text-slate-500 dark:text-slate-400">supply air</div>
        </div>
        <div className="text-right text-xs">
          <div className="text-slate-500 dark:text-slate-400">set {fmt(sp)}</div>
          {dev !== null && (
            <div className={clsx('tabular font-medium', Math.abs(dev) > (r.tolerance ?? 2) ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
              {dev >= 0 ? '+' : '−'}
              {fmt(Math.abs(dev), true)}
            </div>
          )}
        </div>
      </div>
      <div className="text-brand-500">
        <Sparkline data={r.spark ?? []} stroke={SPARK[r.status]} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(r.lastSeenAt)}
        </span>
        <span className="flex items-center gap-3">
          {r.powerOn === false && (
            <span className="flex items-center gap-1 text-violet-600">
              <Power className="h-3 w-3" /> off
            </span>
          )}
          {!!r.faultCode && (
            <span className="flex items-center gap-1 text-red-600">
              <Zap className="h-3 w-3" /> F{r.faultCode}
            </span>
          )}
          {r.openAlerts > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <Bell className="h-3 w-3" /> {r.openAlerts}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}

export function Metric({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border bg-slate-50/60 p-4 dark:bg-slate-900/40">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {icon ?? <Thermometer className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={clsx('tabular mt-1.5 text-xl font-semibold', tone)}>{value}</div>
    </div>
  );
}

// ───────── Create / edit form ─────────

export interface ReeferFormValue {
  containerNo: string;
  deviceId: string;
  name: string;
  brand: string;
  model: string;
  targetTemp: string;
  tolerance: string;
  tags: string;
  notes: string;
  active: boolean;
}

export const emptyReefer = (o: Partial<ReeferFormValue> = {}): ReeferFormValue => ({
  containerNo: '',
  deviceId: '',
  name: '',
  brand: '',
  model: '',
  targetTemp: '',
  tolerance: '',
  tags: '',
  notes: '',
  active: true,
  ...o,
});

export function toForm(r: Omit<ReeferRow, 'openAlerts'>, unit: 'C' | 'F'): ReeferFormValue {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    containerNo: r.containerNo,
    deviceId: r.deviceId,
    name: s(r.name),
    brand: s(r.brand),
    model: s(r.model),
    targetTemp: r.targetTemp === null ? '' : String(Math.round(toUnit(r.targetTemp, unit) * 10) / 10),
    tolerance: r.tolerance === null ? '' : String(Math.round(toUnit(r.tolerance, unit, true) * 10) / 10),
    tags: r.tags,
    notes: s(r.notes),
    active: r.active,
  };
}

/** Common target temperatures (°C) for one-click entry. */
const QUICK_TEMPS = [-25, -18, 0, 2, 5, 13.3];

/** Slide-over form used for create, edit and "register discovered device". */
export function ReeferForm({
  open,
  onClose,
  onSaved,
  initial,
  editId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (r: { id: number }) => void;
  initial: ReeferFormValue;
  editId?: number;
  title?: string;
}) {
  const { unit } = useTemp();
  const { toast } = useFeedback();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ReeferFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...v,
        deviceId: v.deviceId || undefined,
        targetTemp: v.targetTemp === '' ? null : Math.round(fromUnit(Number(v.targetTemp), unit) * 100) / 100,
        tolerance: v.tolerance === '' ? null : Math.round(fromUnit(Number(v.tolerance), unit, true) * 100) / 100,
      };
      const r = await api<{ id: number }>(editId ? `/api/reefers/${editId}` : '/api/reefers', { method: editId ? 'PATCH' : 'POST', body });
      toast({ tone: 'success', title: editId ? 'Reefer updated' : 'Reefer registered', body: v.containerNo.toUpperCase() });
      onSaved(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={title ?? (editId ? 'Edit reefer' : 'Register a reefer')}
      description="Identity and temperature settings only — live readings arrive automatically over MQTT."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!v.containerNo.trim()}>
            {editId ? 'Save changes' : 'Register reefer'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">{error}</div>}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Identity</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Container number *" hint="e.g. MSKU1234565">
              <input className="input font-mono uppercase" value={v.containerNo} onChange={set('containerNo')} autoFocus={!editId} />
            </Field>
            <Field label="Device ID" hint="ID in the MQTT payload. Leave empty to use the container number.">
              <input className="input font-mono uppercase" value={v.deviceId} onChange={set('deviceId')} placeholder={v.containerNo.toUpperCase() || 'same as container'} />
            </Field>
            <Field label="Display name" className="sm:col-span-2">
              <input className="input" value={v.name} onChange={set('name')} placeholder="e.g. Bananas — Ecuador" />
            </Field>
            <Field label="Unit brand">
              <input className="input" value={v.brand} onChange={set('brand')} list="brands" placeholder="Carrier, Thermo King…" />
              <datalist id="brands">
                {['Carrier', 'Thermo King', 'Daikin', 'Star Cool', 'MCI'].map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Model">
              <input className="input" value={v.model} onChange={set('model')} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Temperature & tags</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={`Target temperature (°${unit})`} hint="Temperature the unit should hold">
              <input className="input tabular" type="number" step="0.1" value={v.targetTemp} onChange={set('targetTemp')} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_TEMPS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setV({ ...v, targetTemp: String(Math.round(toUnit(t, unit) * 10) / 10) })}
                    className="rounded-full border px-2.5 py-1 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:text-slate-300"
                  >
                    {Math.round(toUnit(t, unit) * 10) / 10}°{unit}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`Allowed deviation (°${unit})`} hint="Overrides the site default for this reefer">
              <input className="input tabular" type="number" step="0.1" min="0" value={v.tolerance} onChange={set('tolerance')} placeholder="site default" />
            </Field>
          </div>
          <Field label="Tags" hint="Comma separated — used to target alert rules (e.g. pharma, priority)">
            <input className="input" value={v.tags} onChange={set('tags')} placeholder="pharma, priority" />
          </Field>
          <Field label="Notes">
            <textarea className="input min-h-[80px]" value={v.notes} onChange={set('notes')} />
          </Field>
        </section>
      </div>
    </SlideOver>
  );
}
