import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/** Rules created on an empty database (by the seed script and on first production start). */
export const DEFAULT_RULES = [
  { name: 'Temperature out of tolerance', description: 'Supply air drifts beyond the reefer’s allowed tolerance.', metric: 'deviation', operator: 'gt', threshold: 0, useTolerance: true, durationSec: 600, severity: 'warning', repeatMin: 60 },
  { name: 'Severe temperature excursion', description: 'Cargo at risk — supply air far from set point.', metric: 'deviation', operator: 'gt', threshold: 3, useTolerance: true, durationSec: 300, severity: 'critical', repeatMin: 30, notifyEmail: true, notifyHook: true },
  { name: 'Reefer fault', description: 'Unit reports a non-zero fault code.', metric: 'fault', operator: 'gt', threshold: 0, durationSec: 0, severity: 'critical', repeatMin: 30, notifyEmail: true, notifyHook: true },
  { name: 'Powered off', description: 'Unit is not running.', metric: 'power_off', operator: 'gt', threshold: 0, durationSec: 300, severity: 'warning' },
  { name: 'No data', description: 'Gateway has stopped reporting.', metric: 'offline', operator: 'gt', threshold: 15, durationSec: 0, severity: 'critical', repeatMin: 60 },
  { name: 'Set point differs from target', description: 'The set point was changed away from the reefer’s target temperature.', metric: 'target_mismatch', operator: 'gt', threshold: 0.5, durationSec: 0, severity: 'warning' },
];

/**
 * Creates the first admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) when there are no users,
 * and the default alert rules when there are none. Existing data is never changed.
 */
export async function ensureBaseData(db: PrismaClient, log: (msg: string) => void = console.log) {
  if ((await db.user.count()) === 0) {
    const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? '';
    if (!email || password.length < 8) {
      log('No users yet — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ characters) to create the first admin');
    } else {
      await db.user.create({ data: { email, name: 'Administrator', role: 'admin', passwordHash: await bcrypt.hash(password, 10) } });
      log(`Admin created: ${email}`);
    }
  }
  if ((await db.alertRule.count()) === 0) {
    await db.alertRule.createMany({ data: DEFAULT_RULES });
    log('Default alert rules created');
  }
}
