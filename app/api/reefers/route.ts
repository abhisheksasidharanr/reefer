import { route } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { listReefers, reeferInput, sparklines } from '@/lib/server/reefers';

export const GET = route(async () => {
  const reefers = await listReefers();
  const spark = await sparklines(reefers.map((r) => r.id));
  return reefers.map((r) => ({ ...r, spark: spark.get(r.id) ?? [] }));
});

export const POST = route(async (req) => {
  const data = reeferInput.parse(await req.json());
  const reefer = await db.reefer.create({ data: { ...data, deviceId: data.deviceId ?? data.containerNo } });
  // A device that was waiting in "Discovered" is now registered.
  await db.discoveredDevice.deleteMany({ where: { deviceId: reefer.deviceId } });
  return reefer;
}, 'operator');

export const dynamic = 'force-dynamic';
