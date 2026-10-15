'use client';

import clsx from 'clsx';
import {
  Bell,
  BellRing,
  Box,
  Container,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Pin,
  PinOff,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  Snowflake,
  Sun,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { api, useData } from '@/lib/client';
import { AppProviders, useCan, useLive, useLiveConnected, useMe } from './providers';
import { FeedbackProvider } from './ui';

interface Badges {
  unacked: number;
  critical: number;
  discovered: number;
  mqtt: { mode: string; state: string; clients: number; detail: string | null };
  feed: { demo: boolean; intervalSec: number; lastDataAt: string | null };
  reefers: { id: number; containerNo: string; name: string | null; tags: string }[];
}

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/reefers', label: 'Reefers', icon: Container },
  { href: '/fleet', label: '3D view', icon: Box },
  { href: '/alerts', label: 'Alerts', icon: Bell, badge: 'unacked' as const },
  { href: '/rules', label: 'Alert rules', icon: ShieldAlert },
  { href: '/discovered', label: 'Discovered', icon: Radar, badge: 'discovered' as const },
  { href: '/settings', label: 'Settings', icon: Settings, admin: true },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <FeedbackProvider>
      <AppProviders>
        <Frame>{children}</Frame>
      </AppProviders>
    </FeedbackProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const can = useCan();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop sidebar: icon rail by default, slides open on hover; can be pinned open.
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const expanded = pinned || hover;
  const badges = useData<Badges>('/api/badges');
  useLive(['alert', 'mqtt'], () => badges.refresh(), 2000);
  useEffect(() => {
    const t = setInterval(() => badges.refresh(), 30_000);
    return () => clearInterval(t);
  }, [badges.refresh]);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    try {
      setPinned(localStorage.getItem('rm-sidebar-pinned') === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    if (!next) setHover(false);
    try {
      localStorage.setItem('rm-sidebar-pinned', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const onEnter = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(true), 120); // small delay avoids accidental opens
  };
  const onLeave = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(false), 180);
  };

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const renderNav = (open: boolean) => (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.filter((n) => !n.admin || can('admin')).map((n) => {
        const count = n.badge ? badges.data?.[n.badge] ?? 0 : 0;
        const badgeTone = n.badge === 'unacked' && badges.data?.critical ? 'bg-red-500 text-white' : 'bg-brand-600 text-white dark:bg-brand-500 dark:text-slate-950';
        return (
          <Link
            key={n.href}
            href={n.href}
            title={open ? undefined : n.label}
            className={clsx(
              'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              active(n.href)
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100',
            )}
          >
            {active(n.href) && <span className="absolute -left-3 top-2 h-6 w-1 rounded-r-full bg-brand-500" />}
            <span className="relative shrink-0">
              <n.icon className="h-[18px] w-[18px]" />
              {count > 0 && !open && (
                <span className={clsx('absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold ring-2 ring-white dark:ring-slate-950', badgeTone)}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className={clsx('flex-1 whitespace-nowrap transition-opacity duration-200', open ? 'opacity-100' : 'pointer-events-none opacity-0')}>{n.label}</span>
            {count > 0 && open && <span className={clsx('grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold', badgeTone)}>{count}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const renderBrand = (open: boolean) => (
    <div className="flex h-[72px] items-center gap-3 px-[18px]">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-sky-600 text-white shadow-lg shadow-brand-500/30">
        <Snowflake className="h-5 w-5" />
      </div>
      <div className={clsx('min-w-0 whitespace-nowrap transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}>
        <div className="truncate text-sm font-semibold tracking-tight">{me?.prefs.siteName ?? 'Reefer Monitor'}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Cold chain monitoring</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar: the placeholder reserves the rail width (or full width when pinned) */}
      <div className={clsx('hidden shrink-0 transition-[width] duration-300 lg:block', pinned ? 'w-64' : 'w-[76px]')}>
        <aside
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className={clsx(
            'fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r bg-white/95 backdrop-blur transition-[width,box-shadow] duration-300 ease-out dark:bg-slate-950/95',
            expanded ? 'w-64' : 'w-[76px]',
            hover && !pinned && 'shadow-2xl shadow-slate-900/20',
          )}
        >
          {renderBrand(expanded)}
          {renderNav(expanded)}
          <div className="p-3">
            <button
              onClick={togglePin}
              title={pinned ? 'Auto-hide menu' : 'Keep menu open'}
              className={clsx('flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800/60', !expanded && 'opacity-0')}
            >
              {pinned ? <PinOff className="h-4 w-4 shrink-0" /> : <Pin className="h-4 w-4 shrink-0" />}
              <span className="whitespace-nowrap">{pinned ? 'Auto-hide menu' : 'Keep menu open'}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="flex h-full w-72 animate-fade-in flex-col bg-white dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-3">
              {renderBrand(true)}
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNav(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar badges={badges.data} onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ badges, onMenu }: { badges?: Badges; onMenu: () => void }) {
  const { me } = useMe();
  const router = useRouter();
  const live = useLiveConnected();
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setNotifPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('rm-theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  };

  const m = badges?.mqtt;
  const feed = badges?.feed;
  const demo = !!feed?.demo;
  const streaming = demo && !!feed?.lastDataAt && Date.now() - new Date(feed.lastDataAt).getTime() < Math.max(60, feed.intervalSec * 3) * 1000;
  const mqttOk = demo ? streaming : m && (m.state === 'listening' || m.state === 'connected');
  const chipTitle = demo ? 'Demo data generator — Settings → MQTT' : (m?.detail ?? undefined);
  const chipLabel = demo ? 'Data' : 'MQTT';
  const chipLong = demo ? (streaming ? 'streaming' : 'waiting…') : m ? (m.mode === 'builtin' ? `${m.state} · ${m.clients} gateway${m.clients === 1 ? '' : 's'}` : m.state) : '…';
  const chipShort = demo ? '' : m ? (m.mode === 'builtin' ? `· ${m.clients}` : '') : '';

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-white/80 px-4 py-3 backdrop-blur dark:bg-slate-950/80 sm:px-6 lg:px-8">
      <button onClick={onMenu} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <QuickSearch reefers={badges?.reefers ?? []} onPick={(id) => router.push(`/reefers/${id}`)} />
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/settings?tab=mqtt"
          title={chipTitle}
          className={clsx(
            'hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset sm:flex',
            mqttOk ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30' : 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
          )}
        >
          <span className={clsx('h-2 w-2 rounded-full', mqttOk ? 'bg-emerald-500' : 'bg-red-500')} />
          {chipLabel}
          <span className="hidden xl:inline">{demo ? `· ${chipLong}` : chipLong}</span>
          {chipShort && <span className="xl:hidden">{chipShort}</span>}
        </Link>
        <span title={live ? 'Live updates connected' : 'Reconnecting…'} className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex">
          <span className={clsx('h-2 w-2 rounded-full', live ? 'bg-brand-500' : 'bg-slate-400')} />
          {live ? 'Live' : 'Offline'}
        </span>
        {notifPerm === 'default' && (
          <button
            onClick={() => Notification.requestPermission().then(setNotifPerm)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Enable desktop notifications"
            aria-label="Enable desktop notifications"
          >
            <BellRing className="h-5 w-5" />
          </button>
        )}
        <button onClick={toggleTheme} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Toggle theme">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Account menu">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-semibold text-white dark:from-slate-200 dark:to-slate-400 dark:text-slate-900">
              {me?.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() ?? '·'}
            </span>
            <span className="hidden text-left text-xs leading-tight md:block">
              <span className="block font-medium">{me?.name}</span>
              <span className="block capitalize text-slate-500">{me?.role}</span>
            </span>
          </button>
          {menu && (
            <div className="card absolute right-0 mt-2 w-56 animate-fade-in bg-white p-1 shadow-lift dark:bg-slate-900" onMouseLeave={() => setMenu(false)}>
              <div className="px-3 py-2 text-xs text-slate-500">{me?.email}</div>
              <button
                onClick={async () => {
                  await api('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function QuickSearch({ reefers, onPick }: { reefers: Badges['reefers']; onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return reefers.filter((r) => [r.containerNo, r.name, r.tags].some((v) => v?.toLowerCase().includes(s))).slice(0, 8);
  }, [q, reefers]);

  const pick = (id: number) => {
    onPick(id);
    setQ('');
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, results.length - 1));
          if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0));
          if (e.key === 'Enter' && results[idx]) pick(results[idx].id);
        }}
        placeholder="Search reefers…"
        className="input pl-9 pr-14"
        aria-label="Search reefers"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-slate-50 px-1.5 text-[10px] text-slate-500 dark:bg-slate-800 sm:block">Ctrl K</kbd>
      {open && results.length > 0 && (
        <div className="card absolute mt-2 w-full animate-fade-in overflow-hidden bg-white p-1 shadow-lift dark:bg-slate-900">
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseDown={() => pick(r.id)}
              className={clsx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm', i === idx ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}
            >
              <span className="font-mono font-medium">{r.containerNo}</span>
              <span className="truncate pl-3 text-xs text-slate-500">{[r.name, r.tags].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

