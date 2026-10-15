import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError } from '@/lib/server/api';
import { REMEMBER_HOURS, sessionCookie, signSession, verifyLogin } from '@/lib/server/auth';

// Simple in-memory throttle: 8 failures per email per 15 minutes.
const g = globalThis as unknown as { __loginFails?: Map<string, { n: number; until: number }> };
const fails = (g.__loginFails ??= new Map());

export async function POST(req: NextRequest) {
  try {
    const { email, password, remember } = z
      .object({ email: z.string().trim().min(1), password: z.string().min(1), remember: z.boolean().optional() })
      .parse(await req.json());
    const key = email.toLowerCase();
    const f = fails.get(key);
    if (f && f.n >= 8 && f.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const s = await verifyLogin(email, password);
    if (!s) {
      fails.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60_000 });
      throw new HttpError(401, 'Incorrect email or password');
    }
    fails.delete(key);
    const res = NextResponse.json({ name: s.name, role: s.role });
    res.cookies.set(remember ? sessionCookie(await signSession(s, REMEMBER_HOURS), REMEMBER_HOURS) : sessionCookie(await signSession(s), null));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = 'force-dynamic';
