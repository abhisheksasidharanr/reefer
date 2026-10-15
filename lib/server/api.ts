import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { atLeast, getSession, Role, Session } from './auth';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx = { params: Record<string, string> };
/** What Next.js passes to a route handler (dynamic segments arrive as a promise since Next 15). */
type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: Ctx & { session: Session }) => Promise<unknown>;

/**
 * Wrap a route handler: requires a session with at least `role`, maps errors to JSON
 * `{ error }` responses, and serialises the result (BigInt-safe).
 */
export function route(handler: Handler, role: Role = 'viewer') {
  return async (req: NextRequest, ctx: RouteCtx) => {
    try {
      const session = await getSession();
      if (!session) throw new HttpError(401, 'Please sign in');
      if (!atLeast(session.role, role)) throw new HttpError(403, 'You do not have permission for this action');
      const result = await handler(req, { params: (await ctx.params) ?? {}, session });
      if (result instanceof Response) return result;
      return new NextResponse(JSON.stringify(result ?? { ok: true }, (_, v) => (typeof v === 'bigint' ? Number(v) : v)), {
        headers: { 'content-type': 'application/json' },
      });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  // Next.js control-flow signals (dynamic usage, redirects, not-found) must propagate.
  const digest = (e as { digest?: string } | null)?.digest;
  if (typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))) throw e;
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json({ error: `${first.path.join('.') || 'input'}: ${first.message}`, issues: e.issues }, { status: 400 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return NextResponse.json({ error: `Already exists (${String((e.meta?.target as string[] | string) ?? 'unique field')})` }, { status: 409 });
    if (e.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  console.error('[api]', e);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}

export const idParam = (ctx: Ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
};
