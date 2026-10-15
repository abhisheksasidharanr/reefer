import { route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { mqttStatus } from '@/lib/server/mqtt';

/** Small counters for the navigation + MQTT status chip + reefer list for quick search. */
export const GET = route(async () => {
  const [unacked, critical, discovered, reefers] = await Promise.all([
    db.alert.count({ where: { status: 'active' } }),
    db.alert.count({ where: { status: { in: ['active', 'acknowledged'] }, severity: 'critical' } }),
    db.discoveredDevice.count({ where: { ignored: false } }),
    db.reefer.findMany({ select: { id: true, containerNo: true, name: true, tags: true }, orderBy: { containerNo: 'asc' } }),
  ]);
  return { unacked, critical, discovered, mqtt: mqttStatus(), reefers };
});

export const dynamic = 'force-dynamic';
