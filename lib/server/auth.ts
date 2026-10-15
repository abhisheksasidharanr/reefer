import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';

export const SESSION_COOKIE = 'rm_session';
const TTL_HOURS = 12;
/** Session length when "Remember me" is ticked at sign-in. */
export const REMEMBER_HOURS = 24 * 30;

export type Role = 'admin' | 'operator' | 'viewer';
export interface Session {
  uid: number;
  email: string;
  name: string;
  role: Role;
}

const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };
export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min];

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET must be set (16+ chars)');
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session, hours = TTL_HOURS) {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: Number(payload.uid), email: String(payload.email), name: String(payload.name), role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return readSession(cookies().get(SESSION_COOKIE)?.value);
}

/** `persistHours` keeps the cookie across browser restarts; without it the cookie ends with the browser session. */
export function sessionCookie(token: string, persistHours: number | null = TTL_HOURS) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(persistHours ? { maxAge: persistHours * 3600 } : {}),
  };
}

export async function verifyLogin(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Compare even when the user is unknown so timing does not reveal valid emails.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyzABCDE');
  if (!user || !ok || !user.active) return null;
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { uid: user.id, email: user.email, name: user.name, role: user.role as Role };
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
