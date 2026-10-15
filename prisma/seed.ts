/**
 * Seeds the first admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), default alert rules and
 * demo reefers matching scripts/simulate.ts. Safe to re-run: existing rows are kept.
 */
import { PrismaClient } from '@prisma/client';
import { ensureBaseData } from '../lib/server/bootstrap';

const db = new PrismaClient();

export const DEMO_REEFERS = [
  { containerNo: 'MSKU8812340', name: 'Bananas — Ecuador', brand: 'Carrier', model: 'PrimeLINE', targetTemp: 13.3, tags: 'fruit' },
  { containerNo: 'CMAU5523419', name: 'Frozen beef', brand: 'Thermo King', model: 'Magnum Plus', targetTemp: -18, tags: 'frozen' },
  { containerNo: 'HLBU9087213', name: 'Vaccines batch 22', brand: 'Daikin', model: 'LXE10E', targetTemp: 5, tolerance: 1, tags: 'pharma,priority' },
  { containerNo: 'MSCU4410027', name: 'Seafood', brand: 'Star Cool', model: 'SCI-40', targetTemp: -25, tags: 'frozen' },
  { containerNo: 'OOLU7765120', name: 'Grapes — Chile', brand: 'Carrier', model: 'ThinLINE', targetTemp: 0, tags: 'fruit' },
  { containerNo: 'TGHU3329018', name: 'Dairy', brand: 'Thermo King', model: 'Magnum', targetTemp: 2, tags: 'dairy' },
];

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
