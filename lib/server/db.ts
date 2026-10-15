import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

/** One Prisma client per process (survives dev hot reloads). */
export const db = g.__prisma ?? (g.__prisma = new PrismaClient());
