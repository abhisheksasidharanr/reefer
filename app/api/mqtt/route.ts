import { route } from '@/lib/server/api';
import { recentMessages } from '@/lib/server/ingest';
import { mqttStatus } from '@/lib/server/mqtt';

/** Connection status + the last 200 messages (inspector). */
export const GET = route(async () => ({ status: mqttStatus(), messages: recentMessages() }));

export const dynamic = 'force-dynamic';
