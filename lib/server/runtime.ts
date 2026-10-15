import { invalidateRules, sweep } from './alerts';
import { ensureBaseData } from './bootstrap';
import { bus } from './bus';
import { db } from './db';
import { startMqtt } from './mqtt';
import { getSettings } from './settings';

const g = globalThis as unknown as { __runtimeStarted?: boolean };

/** Started once per server process from instrumentation.ts. */
export async function startRuntime() {
  if (g.__runtimeStarted) return;
  g.__runtimeStarted = true;
  console.log('[runtime] starting MQTT + alert engine');

  // First start on an empty database: admin from env + default rules.
  await ensureBaseData(db, (m) => console.log(`[runtime] ${m}`)).catch((e) => console.error('[runtime] bootstrap failed', e));

  await startMqtt();
  bus.on('settings', (key: string) => {
    if (key === 'mqtt') startMqtt().catch((e) => console.error('[runtime] mqtt restart', e));
  });

  // Offline detection, sustained durations and reminders.
  setInterval(() => sweep().catch((e) => console.error('[runtime] sweep', e)), 30_000);

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
