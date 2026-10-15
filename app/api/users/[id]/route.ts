import { z } from 'zod';
import { HttpError, idParam, route } from '@/lib/server/api';
import { hashPassword } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

const select = { id: true, email: true, name: true, role: true, active: true, lastLoginAt: true, createdAt: true };

async function assertAdminRemains(exceptId: number) {
  const admins = await db.user.count({ where: { role: 'admin', active: true, id: { not: exceptId } } });
  if (admins === 0) throw new HttpError(409, 'At least one active admin must remain');
}

export const PATCH = route(async (req, ctx) => {
  const id = idParam(ctx);
  const u = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      role: z.enum(['admin', 'operator', 'viewer']).optional(),
      active: z.boolean().optional(),
      password: z.string().min(8, 'must be at least 8 characters').optional().or(z.literal('').transform(() => undefined)),
    })
    .parse(await req.json());
  const current = await db.user.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, 'User not found');
  if ((u.role && u.role !== 'admin') || u.active === false) if (current.role === 'admin') await assertAdminRemains(id);
  return db.user.update({
    where: { id },
    data: { name: u.name, role: u.role, active: u.active, ...(u.password ? { passwordHash: await hashPassword(u.password) } : {}) },
    select,
  });
}, 'admin');

export const DELETE = route(async (_req, ctx) => {
  const id = idParam(ctx);
  if (id === ctx.session.uid) throw new HttpError(409, 'You cannot delete your own account');
  await assertAdminRemains(id);
  await db.user.delete({ where: { id } });
  return { ok: true };
}, 'admin');

export const dynamic = 'force-dynamic';
