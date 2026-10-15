import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

/** Pages require a session; API routes check it themselves (and return 401 JSON). */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get('rm_session')?.value;
  let ok = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|login|_next|favicon.ico|icon.svg).*)'],
};
