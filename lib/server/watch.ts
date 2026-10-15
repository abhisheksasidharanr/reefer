import { bus } from './bus';
import { db } from './db';

/**
 * Cross-copy live updates. When the host runs several copies of the app, readings and alerts produced by one
 * copy only reach browsers connected to that copy through the in-process bus. Every few seconds each copy
 * looks for changes in the database and re-announces the ones it did not produce itself.
 */
const POLL_MS = 3_000;
const g = globalThis as unknown as { __watch?: boolean };

export function startWatcher() {
  if (g.__watch) return;
  g.__watch = true;

  // Remember what this copy announced, so it is not announced twice.
  const localReadings = new Map<number, number>(); // reeferId → time
  const localAlerts = new Set<string>(); // `${id}:${kind}`
  bus.on('reading', (d: { reeferId?: number; remote?: boolean }) => {
    if (d?.reeferId && !d.remote) localReadings.set(d.reeferId, Date.now());
  });
  bus.on('alert', (d: { id?: number; kind?: string; remote?: boolean }) => {
    if (d?.id && d.kind && !d.remote) localAlerts.add(`${d.id}:${d.kind}`);
  });

  let since = new Date();
  const seenAlerts = new Set<string>();

  const poll = async () => {
    const from = new Date(since.getTime() - 1_000); // small overlap for clock/commit lag
    const now = new Date();
    try {
      const reefers = await db.reefer.findMany({ where: { lastSeenAt: { gt: from } }, select: { id: true } });
      for (const r of reefers) {
        if (Date.now() - (localReadings.get(r.id) ?? 0) > POLL_MS * 2) bus.emit('reading', { reeferId: r.id, remote: true });
      }

      const alerts = await db.alert.findMany({
        where: { OR: [{ triggeredAt: { gt: from } }, { resolvedAt: { gt: from } }, { acknowledgedAt: { gt: from } }, { lastNotifiedAt: { gt: from } }] },
        include: { reefer: { select: { containerNo: true } } },
      });
      for (const a of alerts) {
        const events: [string, Date | null][] = [
          ['triggered', a.triggeredAt],
          ['reminder', a.lastNotifiedAt && a.lastNotifiedAt.getTime() - a.triggeredAt.getTime() > 5_000 ? a.lastNotifiedAt : null],
          ['acknowledged', a.acknowledgedAt],
          ['resolved', a.resolvedAt],
        ];
        for (const [kind, at] of events) {
          if (!at || at <= from) continue;
          const key = `${a.id}:${kind}:${at.getTime()}`;
          if (seenAlerts.has(key) || localAlerts.has(`${a.id}:${kind}`)) continue;
          seenAlerts.add(key);
          bus.emit('alert', { id: a.id, kind, severity: a.severity, title: a.title, reeferId: a.reeferId, containerNo: a.reefer.containerNo, remote: true });
        }
      }
      since = now;
      // Keep the memo small.
      if (seenAlerts.size > 5_000) seenAlerts.clear();
      if (localAlerts.size > 5_000) localAlerts.clear();
    } catch (e) {
      console.error('[watch] poll failed', e);
    }
    setTimeout(poll, POLL_MS);
  };
  setTimeout(poll, POLL_MS);
}
