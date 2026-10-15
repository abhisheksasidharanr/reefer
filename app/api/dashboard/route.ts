import { route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { listReefers, sparklines } from '@/lib/server/reefers';
import { mqttStatus } from '@/lib/server/mqtt';

/** Fleet overview: reefers with status + 6h supply-temperature sparkline, KPIs, latest alerts. */
export const GET = route(async () => {
  const reefers = await listReefers();
  const spark = await sparklines(reefers.map((r) => r.id));
  const sparkOf = (id: number) => spark.get(id) ?? [];

  const active = reefers.filter((r) => r.active);
  const count = (s: string) => active.filter((r) => r.status === s).length;
  const temps = active.filter((r) => r.status !== 'offline' && r.supplyTemp !== null).map((r) => r.supplyTemp!);
  const latestAlerts = await db.alert.findMany({
    where: { status: { in: ['active', 'acknowledged'] } },
    orderBy: [{ triggeredAt: 'desc' }],
    take: 8,
    include: { reefer: { select: { id: true, containerNo: true, name: true } } },
  });
  const discovered = await db.discoveredDevice.count({ where: { ignored: false } });

  return {
    kpi: {
      total: active.length,
      online: active.filter((r) => !['offline', 'never'].includes(r.status)).length,
      critical: count('critical'),
      warning: count('warning'),
      offline: count('offline') + count('never'),
      off: count('off'),
      avgSupply: temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
      openAlerts: active.reduce((s, r) => s + r.openAlerts, 0),
      unacked: active.reduce((s, r) => s + r.unacked, 0),
      discovered,
    },
    reefers: active.map((r) => ({ ...r, spark: sparkOf(r.id) })),
    alerts: latestAlerts,
    mqtt: mqttStatus(),
  };
});

export const dynamic = 'force-dynamic';
