import { NextResponse } from 'next/server';
import { idParam, route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { RANGES, readingSeries } from '@/lib/server/reefers';

/** ?range=1h|6h|24h|7d|30d  (or ?from&to ISO) ; ?format=csv for a raw export */
export const GET = route(async (req, ctx) => {
  const id = idParam(ctx);
  const sp = req.nextUrl.searchParams;
  const to = sp.get('to') ? new Date(sp.get('to')!) : new Date();
  const from = sp.get('from') ? new Date(sp.get('from')!) : new Date(to.getTime() - (RANGES[sp.get('range') ?? '24h'] ?? RANGES['24h']));

  if (sp.get('format') === 'csv') {
    const reefer = await db.reefer.findUniqueOrThrow({ where: { id }, select: { containerNo: true } });
    const rows = await db.reading.findMany({ where: { reeferId: id, at: { gte: from, lte: to } }, orderBy: { at: 'asc' } });
    const head = 'time_utc,set_temp_c,supply_temp_c,return_temp_c,humidity,voltage,current,power_on,fault_code';
    const lines = rows.map((r) =>
      [r.at.toISOString(), r.setTemp, r.supplyTemp, r.returnTemp, r.humidity, r.voltage, r.current, r.powerOn === null ? '' : r.powerOn ? 1 : 0, r.faultCode]
        .map((v) => (v === null ? '' : v))
        .join(','),
    );
    return new NextResponse([head, ...lines].join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${reefer.containerNo}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv"`,
      },
    });
  }
  return { from: from.getTime(), to: to.getTime(), points: await readingSeries(id, from, to) };
});

export const dynamic = 'force-dynamic';
