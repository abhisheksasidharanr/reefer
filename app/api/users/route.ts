import { z } from 'zod';
import { route } from '@/lib/server/api';
import { hashPassword } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

const select = { id: true, email: true, name: true, role: true, active: true, lastLoginAt: true, createdAt: true };

export const GET = route(async () => db.user.findMany({ select, orderBy: { name: 'asc' } }), 'admin');

export const POST = route(async (req) => {
  const u = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      name: z.string().trim().min(1).max(100),
      role: z.enum(['admin', 'operator', 'viewer']),
      password: z.string().min(8, 'must be at least 8 characters'),
    })
    .parse(await req.json());
  return db.user.create({ data: { email: u.email, name: u.name, role: u.role, passwordHash: await hashPassword(u.password) }, select });
}, 'admin');

export const dynamic = 'force-dynamic';
