import { route } from '@/lib/server/api';
import { recentMessages } from '@/lib/server/ingest';
import { demoRunning } from '@/lib/server/demo';
import { mqttStatus } from '@/lib/server/mqtt';
import { getSettings } from '@/lib/server/settings';

/** Connection status + the last 200 messages (inspector). */
export const GET = route(async () => {
  const s = await getSettings('mqtt');
  return { status: mqttStatus(), messages: recentMessages(), demo: { enabled: s.demoFeed, intervalSec: s.demoIntervalSec, generatingHere: demoRunning() } };
});

export const dynamic = 'force-dynamic';
