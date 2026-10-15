import { invalidateRules, sweep } from './alerts';
import { ensureBaseData } from './bootstrap';
import { bus } from './bus';
import { db } from './db';
import { startDemoLoop } from './demo';
import { holdLease } from './lease';
import { onMessage, startMqtt } from './mqtt';
import { getSettings } from './settings';
import { startWatcher } from './watch';

const g = globalThis as unknown as { __runtimeStarted?: boolean };

/** Started once per server process from instrumentation.ts. */
export async function startRuntime() {
  if (g.__runtimeStarted) return;
  g.__runtimeStarted = true;
  console.log('[runtime] starting MQTT + alert engine');

  // First start on an empty database: admin from env + default rules.
  await ensureBaseData(db, (m) => console.log(`[runtime] ${m}`)).catch((e) => console.error('[runtime] bootstrap failed', e));

  // Never let a broker or database problem stop the web server from starting.
  await startMqtt().catch((e) => console.error('[runtime] mqtt start failed', e));
  bus.on('settings', (key: string) => {
    if (key === 'mqtt') startMqtt().catch((e) => console.error('[runtime] mqtt restart', e));
  });

  // Live updates produced by other copies of the app (hosts that run several).
  startWatcher();

  // In-app demo data (Settings → MQTT → Demo data).
  startDemoLoop(onMessage);

  // Offline detection, sustained durations and reminders — one copy at a time, so alerts are not doubled.
  setInterval(async () => {
    try {
      if (await holdLease('sweep', 90_000)) await sweep();
    } catch (e) {
      console.error('[runtime] sweep', e);
    }
  }, 30_000);

  // Retention: purge old readings every hour.
  const purge = async () => {
    const { retentionDays } = await getSettings('general');
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const { count } = await db.reading.deleteMany({ where: { at: { lt: cutoff } } });
    if (count) console.log(`[runtime] purged ${count} readings older than ${retentionDays} days`);
  };
  setInterval(() => purge().catch((e) => console.error('[runtime] purge', e)), 3_600_000);
  purge().catch(() => undefined);
}

export { invalidateRules };
