import { route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { mqttStatus } from '@/lib/server/mqtt';
import { getSettings } from '@/lib/server/settings';

/** Small counters for the navigation + MQTT status chip + reefer list for quick search. */
export const GET = route(async () => {
  const [unacked, critical, discovered, reefers, mqtt, latest] = await Promise.all([
    db.alert.count({ where: { status: 'active' } }),
    db.alert.count({ where: { status: { in: ['active', 'acknowledged'] }, severity: 'critical' } }),
    db.discoveredDevice.count({ where: { ignored: false } }),
    db.reefer.findMany({ select: { id: true, containerNo: true, name: true, tags: true }, orderBy: { containerNo: 'asc' } }),
    getSettings('mqtt'),
    db.reefer.aggregate({ _max: { lastSeenAt: true } }),
  ]);
  // With demo data on, the chip reports whether data is flowing (works whichever copy of the app answers).
  const feed = { demo: mqtt.demoFeed, intervalSec: mqtt.demoIntervalSec, lastDataAt: latest._max.lastSeenAt };
  return { unacked, critical, discovered, mqtt: mqttStatus(), feed, reefers };
});

export const dynamic = 'force-dynamic';
