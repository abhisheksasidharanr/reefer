'use client';

import clsx from 'clsx';
import { AlertTriangle, CircleCheck, Droplets, Gauge, Power, PowerOff, Snowflake, Target, Thermometer, Timer, WifiOff, Wrench, Zap } from 'lucide-react';
import { useTemp } from './providers';
import { timeAgo } from './ui';

export interface LiveReefer {
  supplyTemp: number | null;
  returnTemp: number | null;
  setTemp: number | null;
  targetTemp: number | null;
  tolerance: number | null;
  humidity: number | null;
  voltage: number | null;
  current: number | null;
  powerOn: boolean | null;
  faultCode: number | null;
  mode: string | null;
  runHours: number | null;
  lastSeenAt: string | null;
  openAlerts: unknown[];
}

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

const TONE = {
  ok: { bar: 'from-emerald-400 to-teal-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
  warn: { bar: 'from-amber-400 to-orange-500', pill: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30', text: 'text-amber-600 dark:text-amber-400' },
  bad: { bar: 'from-red-500 to-rose-600', pill: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30', text: 'text-red-600 dark:text-red-400' },
  idle: { bar: 'from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700', pill: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700', text: 'text-slate-500' },
} as const;

/**
 * One card that answers, in order: Is the cargo at the right temperature? How far off is it?
 * What are the unit's settings? Is the machine itself healthy?
 */
export function LiveStatus({ r, stale }: { r: LiveReefer; stale: boolean }) {
  const { fmt, unit } = useTemp();
  const sp = r.setTemp ?? r.targetTemp;
  const tol = r.tolerance ?? 2;
  const dev = sp !== null && r.supplyTemp !== null ? r.supplyTemp - sp : null;
  const absDev = dev === null ? null : Math.abs(dev);

  const tone: Tone = stale || dev === null ? 'idle' : absDev! <= tol ? 'ok' : absDev! <= tol * 2 ? 'warn' : 'bad';
  const verdict =
    dev === null
      ? 'Waiting for a temperature reading'
      : absDev! <= tol
        ? 'Temperature is OK'
        : `${fmt(absDev, true)} too ${dev > 0 ? 'warm' : 'cold'}`;
  const sentence =
    dev === null
      ? sp === null
        ? 'Set a target temperature for this reefer to compare readings against it.'
        : 'The unit has not reported a supply air temperature yet.'
      : absDev! < 0.05
        ? `Supply air is exactly on the set point of ${fmt(sp)}. Allowed range: ${fmt(sp! - tol)} to ${fmt(sp! + tol)}.`
        : `Supply air is ${fmt(absDev, true)} ${dev > 0 ? 'above' : 'below'} the set point of ${fmt(sp)}. Allowed range: ${fmt(sp! - tol)} to ${fmt(sp! + tol)}.`;

  return (
    <section className="card relative overflow-hidden">
      <div className={clsx('h-1.5 w-full bg-gradient-to-r', TONE[tone].bar)} />

      <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {!stale && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full', stale ? 'bg-slate-400' : 'bg-emerald-500')} />
          </span>
          <h2 className="text-sm font-semibold">Live status</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">· updated {timeAgo(r.lastSeenAt)}</span>
        </div>
        {stale && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <WifiOff className="h-3.5 w-3.5" /> Not receiving data — showing last known values
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 items-center gap-8 px-6 pb-6 pt-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Dial */}
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-[320px]">
            <Dial dev={dev} tol={tol} sp={sp} tone={tone} fmt={fmt} />
            <div className="absolute inset-x-0 bottom-[4%] flex flex-col items-center">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Supply air</div>
              <div className={clsx('tabular text-5xl font-bold leading-none tracking-tight', stale && 'text-slate-400')}>
                {r.supplyTemp === null ? '—' : fmt(r.supplyTemp).replace(/ °.$/, '')}
                <span className="ml-0.5 align-top text-xl font-medium text-slate-400">°{unit}</span>
              </div>
            </div>
          </div>
          <div className={clsx('mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset', TONE[tone].pill)}>
            {tone === 'ok' ? <CircleCheck className="h-4 w-4" /> : tone === 'idle' ? <Thermometer className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {verdict}
          </div>
        </div>

        {/* Explained readings */}
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Reading icon={<Gauge className="h-4 w-4" />} label="Set point" value={fmt(r.setTemp)} help="What the unit is set to hold" />
            <Reading icon={<Thermometer className="h-4 w-4" />} label="Return air" value={fmt(r.returnTemp)} help="Air coming back from the cargo" />
            <Reading
              icon={<Target className="h-4 w-4" />}
              label="Target"
              value={fmt(r.targetTemp)}
              help="What it should be set to"
              warn={r.targetTemp !== null && r.setTemp !== null && Math.abs(r.targetTemp - r.setTemp) > 0.5}
            />
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            {sentence}
            {r.targetTemp !== null && r.setTemp !== null && Math.abs(r.targetTemp - r.setTemp) > 0.5 && (
              <span className="mt-1 block font-medium text-amber-700 dark:text-amber-300">
                Heads-up: the set point ({fmt(r.setTemp)}) differs from the target ({fmt(r.targetTemp)}).
              </span>
            )}
            {tone !== 'ok' && tone !== 'idle' && r.openAlerts.length === 0 && (
              <span className="mt-1 block text-xs text-slate-500">No alert yet — rules wait for their set duration before raising one.</span>
            )}
          </p>
        </div>
      </div>

      {/* Machine health strip */}
      <HealthStrip r={r} />
    </section>
  );
}

function Reading({ icon, label, value, help, warn }: { icon: React.ReactNode; label: string; value: string; help: string; warn?: boolean }) {
  // "-25.0 °C" → number + smaller unit, so values fit three-across on phones
  const cut = value.lastIndexOf(' ');
  const [num, suffix] = cut > 0 ? [value.slice(0, cut), value.slice(cut + 1)] : [value, ''];
  return (
    <div className={clsx('min-w-0 rounded-xl border px-2.5 py-3 transition sm:p-4', warn ? 'border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5' : 'bg-white dark:bg-slate-900/40')}>
      <div className="flex items-center gap-1.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="hidden text-brand-600 sm:inline dark:text-brand-400">{icon}</span>
        {label}
      </div>
      <div className="tabular mt-1.5 whitespace-nowrap text-base font-semibold tracking-tight sm:text-2xl">
        {num}
        {suffix && <span className="ml-0.5 text-[11px] font-medium text-slate-400 sm:ml-1 sm:text-base">{suffix}</span>}
      </div>
      <div className="mt-0.5 hidden text-xs text-slate-400 sm:block">{help}</div>
    </div>
  );
}

/** Semicircular gauge: needle = supply air vs set point; green arc = allowed range; ends = ±3× tolerance. */
function Dial({ dev, tol, sp, tone, fmt }: { dev: number | null; tol: number; sp: number | null; tone: Tone; fmt: (c: number | null | undefined, delta?: boolean) => string }) {
  const W = 300;
  const H = 192;
  const cx = W / 2;
  const cy = 178;
  const R = 128;
  const span = tol * 3;
  // value → angle: -span → 180°, +span → 0°
  const ang = (v: number) => Math.PI - ((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * Math.PI;
  const pt = (a: number, rad = R) => [cx + rad * Math.cos(a), cy - rad * Math.sin(a)] as const;
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(ang(from));
    const [x2, y2] = pt(ang(to));
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  };
  const segments: [number, number, string][] = [
    [-span, -tol * 2, '#2563eb'],
    [-tol * 2, -tol, '#60a5fa'],
    [-tol, tol, '#10b981'],
    [tol, tol * 2, '#f59e0b'],
    [tol * 2, span, '#ef4444'],
  ];
  const needle = dev === null ? null : ang(dev);
  const ticks = [-span, -tol, 0, tol, span];
  const needleColor = { ok: '#059669', warn: '#d97706', bad: '#dc2626', idle: '#94a3b8' }[tone];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px]" role="img" aria-label="Deviation from set point gauge">
      {/* track */}
      <path d={arc(-span, span)} fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" className="text-slate-100 dark:text-slate-800" />
      {segments.map(([a, b, c]) => (
        <path key={a} d={arc(a, b)} fill="none" stroke={c} strokeWidth="14" opacity={dev === null ? 0.25 : a === -tol ? 0.95 : 0.55} />
      ))}
      {/* ticks */}
      {ticks.map((t) => {
        const [x1, y1] = pt(ang(t), R + 12);
        const [x2, y2] = pt(ang(t), R + 18);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" className="text-slate-300 dark:text-slate-600" />;
      })}
      {/* end labels in real temperatures */}
      {sp !== null && (
        <>
          <text x={pt(Math.PI, R)[0] + 4} y={cy + 14} fontSize="10" textAnchor="middle" className="fill-slate-400">
            {fmt(sp - span).replace(' ', '')}
          </text>
          <text x={pt(0, R)[0] - 4} y={cy + 14} fontSize="10" textAnchor="middle" className="fill-slate-400">
            {fmt(sp + span).replace(' ', '')}
          </text>
          <text x={cx} y={cy - R - 32} fontSize="10" textAnchor="middle" className="fill-slate-400">
            set {fmt(sp).replace(' ', '')}
          </text>
        </>
      )}
      {/* marker riding on the arc (no centre needle, so the reading inside stays clear) */}
      {needle !== null && (
        <g>
          <circle cx={pt(needle, R)[0]} cy={pt(needle, R)[1]} r="17" fill={needleColor} opacity="0.18" />
          <circle cx={pt(needle, R)[0]} cy={pt(needle, R)[1]} r="10" fill="white" stroke={needleColor} strokeWidth="4" />
          <line x1={pt(needle, R - 16)[0]} y1={pt(needle, R - 16)[1]} x2={pt(needle, R - 30)[0]} y2={pt(needle, R - 30)[1]} stroke={needleColor} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

function HealthStrip({ r }: { r: LiveReefer }) {
  const running = r.powerOn;
  const fault = r.faultCode;
  const tiles: { label: string; value: string; sub: string; icon: React.ReactNode; tone: 'ok' | 'bad' | 'off' | 'neutral' }[] = [
    {
      label: 'Power',
      value: running === null ? '—' : running ? 'Running' : 'Off',
      sub: running === false ? 'Unit is not cooling' : running ? 'Compressor active' : 'No data',
      icon: running === false ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />,
      tone: running === null ? 'neutral' : running ? 'ok' : 'off',
    },
    {
      label: 'Fault',
      value: fault ? `Code ${fault}` : fault === 0 ? 'No fault' : '—',
      sub: fault ? 'Check the unit' : 'Machine healthy',
      icon: <Wrench className="h-4 w-4" />,
      tone: fault ? 'bad' : fault === 0 ? 'ok' : 'neutral',
    },
    { label: 'Mode', value: r.mode ? r.mode.charAt(0).toUpperCase() + r.mode.slice(1) : '—', sub: 'Operating mode', icon: <Snowflake className="h-4 w-4" />, tone: 'neutral' },
    { label: 'Humidity', value: r.humidity === null ? '—' : `${r.humidity.toFixed(0)} %`, sub: 'Relative humidity', icon: <Droplets className="h-4 w-4" />, tone: 'neutral' },
    {
      label: 'Electrical',
      value: r.voltage === null ? '—' : `${r.voltage.toFixed(0)} V`,
      sub: r.current === null ? 'Current —' : `${r.current.toFixed(1)} A drawn`,
      icon: <Zap className="h-4 w-4" />,
      tone: 'neutral',
    },
    { label: 'Run hours', value: r.runHours === null ? '—' : `${Math.round(r.runHours).toLocaleString()} h`, sub: 'Total compressor time', icon: <Timer className="h-4 w-4" />, tone: 'neutral' },
  ];
  const iconTone = {
    ok: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    bad: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
    off: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    neutral: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  };
  const valueTone = { ok: 'text-emerald-700 dark:text-emerald-300', bad: 'text-red-600 dark:text-red-400', off: 'text-violet-700 dark:text-violet-300', neutral: '' };

  return (
    <div className="grid grid-cols-2 gap-px border-t bg-slate-200 sm:grid-cols-3 2xl:grid-cols-6 dark:bg-slate-800">
      {tiles.map((t) => (
        <div key={t.label} className="flex items-center gap-3 bg-slate-50 px-5 py-4 dark:bg-slate-900">
          <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', iconTone[t.tone])}>{t.icon}</span>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.label}</div>
            <div className={clsx('tabular truncate text-sm font-semibold', valueTone[t.tone])}>{t.value}</div>
            <div className="truncate text-[11px] text-slate-400">{t.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
