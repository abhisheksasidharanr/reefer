'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { fmtTemp } from '@/lib/units';
import { useFeedback } from './ui';

// ───────── Current user & preferences ─────────

export interface Me {
  uid: number;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  prefs: { siteName: string; tempUnit: 'C' | 'F'; offlineAfterSec: number; inAppSeverities: string[]; sound: boolean };
}

const MeCtx = createContext<{ me: Me | null; reload: () => void }>({ me: null, reload: () => {} });
export const useMe = () => useContext(MeCtx);

const RANK = { viewer: 0, operator: 1, admin: 2 } as const;

/** Permission check; stable identity per user so it is safe in effect dependencies. */
export function useCan() {
  const { me } = useMe();
  const role = me?.role;
  return useCallback((min: 'viewer' | 'operator' | 'admin') => !!role && RANK[role] >= RANK[min], [role]);
}

/** Temperature formatter bound to the site unit. */
export function useTemp() {
  const { me } = useMe();
  const unit = me?.prefs.tempUnit ?? 'C';
  return { unit, fmt: (c: number | null | undefined, delta = false, digits = 1) => fmtTemp(c, unit, delta, digits) };
}

// ───────── Live events (SSE) ─────────

type Listener = (event: string, data: unknown) => void;
const LiveCtx = createContext<{ subscribe: (fn: Listener) => () => void; connected: boolean }>({ subscribe: () => () => {}, connected: false });

/** Run `fn` (throttled) whenever one of `events` arrives. */
export function useLive(events: string[], fn: (event: string, data: unknown) => void, throttleMs = 1500) {
  const { subscribe } = useContext(LiveCtx);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const key = events.join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last: [string, unknown] | null = null;
    return subscribe((event, data) => {
      if (!key.split(',').includes(event)) return;
      last = [event, data];
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (last) fnRef.current(...last);
      }, throttleMs);
    });
  }, [subscribe, key, throttleMs]);
}

export const useLiveConnected = () => useContext(LiveCtx).connected;

function beep(severity: string) {
  try {
    const ctx = new AudioContext();
    const tones = severity === 'critical' ? [880, 660, 880] : [660];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
  } catch {
    /* audio blocked */
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const { toast } = useFeedback();

  const reload = useCallback(() => {
    api<Me>('/api/auth/me').then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(reload, [reload]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      es = new EventSource('/api/stream');
      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(open, 5000);
      };
      for (const ev of ['reading', 'alert', 'mqtt', 'message']) {
        es.addEventListener(ev, (m) => {
          const data = JSON.parse((m as MessageEvent).data);
          listeners.current.forEach((fn) => fn(ev, data));
        });
      }
    };
    open();
    return () => {
      clearTimeout(retry);
      es?.close();
    };
  }, []);

  // In-app alert notifications.
  useEffect(() => {
    if (!me) return;
    return subscribe((event, data) => {
      if (event !== 'alert') return;
      const a = data as { kind: string; severity: string; title: string; containerNo: string; reeferId: number };
      if (a.kind !== 'triggered' && a.kind !== 'reminder') return;
      if (!me.prefs.inAppSeverities.includes(a.severity)) return;
      toast({
        tone: a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info',
        title: `${a.containerNo} · ${a.title}`,
        body: a.kind === 'reminder' ? 'Still unacknowledged' : 'New alert',
        href: `/reefers/${a.reeferId}`,
      });
      if (me.prefs.sound) beep(a.severity);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        new Notification(`${a.severity.toUpperCase()}: ${a.containerNo}`, { body: a.title, tag: `alert-${a.reeferId}` });
      }
    });
  }, [me, subscribe, toast]);

  return (
    <MeCtx.Provider value={{ me, reload }}>
      <LiveCtx.Provider value={{ subscribe, connected }}>{children}</LiveCtx.Provider>
    </MeCtx.Provider>
  );
}

export { fmtTemp };
