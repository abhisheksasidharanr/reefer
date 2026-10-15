'use client';

import { ArrowRight, BellRing, Check, Eye, EyeOff, Loader2, Lock, Mail, Radio, ShieldCheck, Snowflake, ThermometerSnowflake, Webhook } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/client';

const FEATURES = [
  { icon: ThermometerSnowflake, title: 'Live telemetry', body: 'Supply, return, set point, power and faults streamed over MQTT.' },
  { icon: BellRing, title: 'Smart alerts', body: 'Rules with tolerances, durations, reminders, email and webhooks.' },
  { icon: Radio, title: 'Plug & play', body: 'Built-in broker and a field mapper for any gateway JSON.' },
];

const INTEGRATIONS = [
  { icon: Radio, label: 'MQTT' },
  { icon: Mail, label: 'Email' },
  { icon: Webhook, label: 'Webhooks' },
];

// ───────── Pieces ─────────

function Logo({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-12 w-12 rounded-xl';
  return (
    <div className={`relative grid shrink-0 place-items-center bg-gradient-to-br from-brand-400 via-sky-600 to-blue-800 text-white shadow-lg shadow-sky-900/40 ring-1 ring-white/25 ${box}`}>
      <Snowflake className={size === 'lg' ? 'h-8 w-8' : 'h-7 w-7'} strokeWidth={2.2} />
    </div>
  );
}

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      Reefer <span className="text-brand-400">Monitor</span>
    </span>
  );
}

/** Decorative glass telemetry card floating over the photo (sample values for a frozen load). */
function TelemetryCard() {
  const line = 'M0,34 C12,30 18,22 28,28 S44,40 54,26 64,8 74,24 88,36 98,22 112,18 124,28 138,34 150,24 164,30 176,26';
  return (
    <div className="pointer-events-none absolute left-[39.5%] top-[43%] hidden w-[20rem] min-[1600px]:block" aria-hidden>
      {/* connector pins */}
      <span className="absolute -top-16 left-[29%] h-16 w-px bg-gradient-to-b from-transparent to-brand-300/70" />
      <Pin className="-top-[4.6rem] left-[29%]" />
      <span className="absolute -bottom-16 left-[2%] h-16 w-px bg-gradient-to-t from-transparent to-brand-300/70" />
      <Pin className="-bottom-[4.6rem] left-[2%]" />
      <Pin className="right-[-1.6rem] top-[58%]" />

      <div className="relative overflow-hidden rounded-2xl border border-brand-300/40 bg-slate-900/45 p-4 text-white shadow-[0_0_40px_-6px_rgba(34,211,238,0.45)] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold tracking-wide">TRLU 876543 6</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            Online
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <Snowflake className="h-5 w-5 text-brand-200" />
          </div>
          <div>
            <div className="text-[11px] leading-none text-slate-300">Supply air</div>
            <div className="tabular text-2xl font-bold leading-tight">-18.2°C</div>
          </div>
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-slate-300">Return</dt>
            <dd className="tabular text-right font-medium">-17.1°C</dd>
            <dt className="text-slate-300">Set point</dt>
            <dd className="tabular text-right font-medium">-18.0°C</dd>
          </dl>
        </div>
        <svg viewBox="0 0 176 44" className="mt-2 h-12 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="tc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#22d3ee" stopOpacity="0.45" />
              <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L176,44 L0,44 Z`} fill="url(#tc-fill)" />
          <path d={line} fill="none" stroke="#67e8f9" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}

function Pin({ className }: { className: string }) {
  return (
    <span className={`absolute grid h-4 w-4 -translate-x-1/2 place-items-center ${className}`}>
      <span className="absolute h-4 w-4 animate-pulse-ring rounded-full bg-brand-300/60" />
      <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
    </span>
  );
}

/** Left-hand marketing column; spacing scales with the window height so it never scrolls. */
function Showcase() {
  return (
    <div className="relative hidden h-full min-h-0 flex-col justify-between px-10 py-[4.5vh] text-white lg:flex xl:px-16">
      <div>
        <div className="flex items-center gap-4">
          <Logo />
          <Wordmark className="text-3xl xl:text-4xl" />
        </div>
        <p className="mt-[2vh] text-xs font-medium uppercase tracking-[0.35em] text-slate-300">Real-time cold chain visibility</p>
      </div>

      <div className="max-w-xl">
        <h2 className="text-[clamp(2.25rem,6.3vh,3.75rem)] font-extrabold leading-[1.08] tracking-tight">
          Every degree of
          <br />
          your cold chain,
          <br />
          <span className="text-brand-400">in real time.</span>
        </h2>
        <p className="mt-[2vh] max-w-md text-lg leading-relaxed text-slate-200">Monitor, track and protect your refrigerated containers around the clock.</p>
        <ul className="mt-[3.5vh] space-y-[2.2vh]">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex items-center gap-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/15 bg-slate-900/40 shadow-lg backdrop-blur">
                <f.icon className="h-6 w-6 text-slate-100" strokeWidth={1.75} />
              </div>
              <div>
                <div className="text-lg font-bold">{f.title}</div>
                <div className="max-w-sm text-sm leading-snug text-slate-300">{f.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="max-w-xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-white/10 py-[2vh]">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-300">Integrations</span>
          {INTEGRATIONS.map((it, i) => (
            <span key={it.label} className={`flex items-center gap-2 text-sm font-medium text-slate-100 ${i ? 'border-l border-white/20 pl-6' : ''}`}>
              <it.icon className="h-5 w-5" strokeWidth={1.75} />
              {it.label}
            </span>
          ))}
        </div>
        <p className="mt-[2vh] text-sm text-slate-300">© {new Date().getFullYear()} Reefer Monitor. All rights reserved.</p>
      </div>
    </div>
  );
}

// ───────── Form ─────────

export interface LoginDefaults {
  email: string;
  password: string;
}

function LoginForm({ defaults }: { defaults?: LoginDefaults }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [password, setPassword] = useState(defaults?.password ?? '');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { body: { email, password, remember } });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  };

  const field =
    'peer h-11 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-10 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:ring-[3px] focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800';
  const fieldIcon = 'pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition peer-focus:text-brand-600';
  const label = 'text-[13px] font-semibold text-slate-700 dark:text-slate-300';

  return (
    <div className="relative w-full max-w-[25rem] overflow-hidden rounded-2xl bg-white/[0.97] shadow-[0_30px_80px_-20px_rgb(2_6_23/0.65),0_0_0_1px_rgb(255_255_255/0.6)] backdrop-blur-xl dark:bg-slate-900/95 dark:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(51_65_85/0.6)]">
      {/* brand accent */}
      <div aria-hidden className="h-1 bg-gradient-to-r from-brand-400 via-sky-500 to-blue-700" />
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-400/15 blur-3xl" />

      <div className="relative px-7 pb-6 pt-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-400 via-sky-600 to-blue-800 text-white shadow-md shadow-sky-900/30">
            <Snowflake className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <Wordmark className="text-lg text-slate-900 dark:text-white [&>span]:text-brand-600 dark:[&>span]:text-brand-400" />
        </div>

        <h1 className="mt-5 text-[1.65rem] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to monitor your refrigerated containers.</p>

        <form onSubmit={submit} className="mt-5 space-y-3.5">
          <div className="space-y-1.5">
            <label htmlFor="email" className={label}>
              Email
            </label>
            <div className="relative">
              <input id="email" type="email" autoComplete="username" placeholder="name@company.com" className={field} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <Mail className={fieldIcon} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className={label}>
                Password
              </label>
              <button type="button" onClick={() => setForgot((v) => !v)} aria-expanded={forgot} className="text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline dark:text-brand-400">
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                className={`${field} !pr-11`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Lock className={fieldIcon} />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
                title={show ? 'Hide password' : 'Show password'}
                className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

          {forgot && (
            <p className="animate-fade-in rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-200/80 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/30">
              Ask an administrator to set a new password for you in Settings → Users.
            </p>
          )}

          <label className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="peer sr-only" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] border-[1.5px] border-slate-300 bg-white text-white transition peer-checked:border-sky-700 peer-checked:bg-sky-700 peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800">
              <Check className={`h-3 w-3 transition ${remember ? 'scale-100' : 'scale-0'}`} strokeWidth={3.5} />
            </span>
            Keep me signed in for 30 days
          </label>

          {error && (
            <div role="alert" className="animate-fade-in rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-b from-sky-600 to-sky-800 text-[15px] font-semibold text-white shadow-[0_8px_20px_-6px_rgb(3_105_161/0.6),inset_0_1px_0_rgb(255_255_255/0.2)] transition hover:from-sky-500 hover:to-sky-700 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/40 active:translate-y-px disabled:opacity-70"
          >
            Sign in
            {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ArrowRight className="h-[18px] w-[18px] transition group-hover:translate-x-0.5" />}
          </button>
        </form>
      </div>

      <div className="relative flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
        <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        Secure, encrypted access to your operations
      </div>
    </div>
  );
}

// ───────── Page ─────────

export default function LoginView({ defaults }: { defaults?: LoginDefaults }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950 lg:h-[100dvh]">
      <div aria-hidden className="absolute inset-0 bg-[url('/login-bg.webp')] bg-cover bg-[center_right_30%]" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#06203f]/95 via-[#0a2a4d]/75 to-[#0b2c50]/20" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#061a33]/80 via-transparent to-[#061a33]/30" />
      <TelemetryCard />

      <div className="relative grid min-h-[100dvh] lg:h-full lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_31rem]">
        <Showcase />
        <div className="flex items-center justify-center px-4 py-6 sm:px-8 lg:min-h-0 lg:justify-end lg:overflow-y-auto lg:py-[3vh] lg:pr-10 xl:pr-14">
          <Suspense>
            <LoginForm defaults={defaults} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
