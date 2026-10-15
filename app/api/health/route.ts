import { NextResponse } from 'next/server';
import { db } from '@/lib/server/db';

/** Liveness check for the host (Render health checks): the app is up and the database answers. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'database unavailable' }, { status: 503 });
  }
}

export const dynamic = 'force-dynamic';
