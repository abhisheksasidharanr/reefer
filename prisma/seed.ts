/**
 * Seeds the first admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), default alert rules and
 * demo reefers matching scripts/simulate.ts. Safe to re-run: existing rows are kept.
 */
import { PrismaClient } from '@prisma/client';
import { DEMO_REEFERS } from '../lib/demo-fleet';
import { ensureBaseData } from '../lib/server/bootstrap';

const db = new PrismaClient();


async function main() {
  if (!process.env.SEED_ADMIN_PASSWORD) throw new Error('Set SEED_ADMIN_PASSWORD in .env');
  await ensureBaseData(db);

  for (const r of DEMO_REEFERS) {
    await db.reefer.upsert({ where: { containerNo: r.containerNo }, update: {}, create: { ...r, deviceId: r.containerNo } });
  }
  console.log(`${DEMO_REEFERS.length} demo reefers ready — run "npm run simulate" to stream data`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
