import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { route } from '@/lib/server/api';
import { bus } from '@/lib/server/bus';
import { db } from '@/lib/server/db';

/** ?status=open|active|acknowledged|resolved|all &severity= &reeferId= &q= &page= */
export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? 'open';
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const take = 50;
  const q = sp.get('q')?.trim();
  const where: Prisma.AlertWhereInput = {
    ...(status === 'open' ? { status: { in: ['active', 'acknowledged'] } } : status !== 'all' ? { status } : {}),
    ...(sp.get('severity') ? { severity: sp.get('severity')! } : {}),
    ...(sp.get('reeferId') ? { reeferId: Number(sp.get('reeferId')) } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { reefer: { containerNo: { contains: q, mode: 'insensitive' as const } } }, { reefer: { name: { contains: q, mode: 'insensitive' as const } } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.alert.findMany({
      where,
      orderBy: [{ triggeredAt: 'desc' }],
      skip: (page - 1) * take,
      take,
      include: { reefer: { select: { id: true, containerNo: true, name: true } } },
    }),
    db.alert.count({ where }),
    db.alert.groupBy({ by: ['status', 'severity'], _count: true, where: { status: { in: ['active', 'acknowledged'] } } }),
  ]);
  return { rows, total, page, pageSize: take, counts: counts.map((c) => ({ status: c.status, severity: c.severity, n: c._count })) };
});

const action = z.object({
  ids: z.array(z.number().int()).min(1).max(500),
  action: z.enum(['acknowledge', 'resolve', 'reopen']),
  note: z.string().trim().max(2000).optional(),
});

/** Bulk acknowledge / resolve. */
export const POST = route(async (req, { session }) => {
  const a = action.parse(await req.json());
  const now = new Date();
  const data: Prisma.AlertUpdateManyMutationInput =
    a.action === 'acknowledge'
      ? { status: 'acknowledged', acknowledgedAt: now, acknowledgedBy: session.name }
      : a.action === 'resolve'
        ? { status: 'resolved', resolvedAt: now, resolvedBy: session.name }
        : { status: 'active', resolvedAt: null, resolvedBy: null, acknowledgedAt: null, acknowledgedBy: null };
  const where: Prisma.AlertWhereInput = {
    id: { in: a.ids },
    status: a.action === 'acknowledge' ? 'active' : a.action === 'resolve' ? { in: ['active', 'acknowledged'] } : 'resolved',
  };
  const targets = a.action === 'resolve' ? await db.alert.findMany({ where, select: { ruleId: true, reeferId: true } }) : [];
  const res = await db.alert.updateMany({ where, data: { ...data, ...(a.note ? { note: a.note } : {}) } });
  // Resolving by hand while the condition still holds must not re-open a new alert on the next reading.
  for (const t of targets) {
    if (t.ruleId === null) continue;
    await db.ruleState.updateMany({ where: { ruleId: t.ruleId, reeferId: t.reeferId }, data: { suppressed: true } });
  }
  bus.emit('alert', { kind: a.action, ids: a.ids });
  return { updated: res.count };
}, 'operator');

export const dynamic = 'force-dynamic';
