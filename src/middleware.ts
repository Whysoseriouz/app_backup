import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { COOKIE_NAME } from '@/lib/auth';

// Paths that bypass auth entirely
const PUBLIC_PAGES = new Set(['/login']);
const PUBLIC_API = new Set(['/api/auth/login']);
const TOKEN_API_PREFIXES = ['/api/sync']; // bearer-token auth, no user cookie

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// API paths requiring admin for write methods (user management)
const ADMIN_API_PREFIXES = ['/api/users'];

// Write methods that any authenticated user may call (for UX convenience)
const AUTHED_WRITE_EXEMPT = new Set([
  '/api/auth/logout',
  '/api/auth/password',
  '/api/briefing/ack',
]);

function getSecret(): Uint8Array {
  const s =
    process.env.AUTH_SECRET ||
    'dev-fallback-please-set-AUTH_SECRET-in-production';
  return new TextEncoder().encode(s);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Public pages / API
  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next();
  if (PUBLIC_API.has(pathname)) return NextResponse.next();

  // Token-protected API (e.g. /api/sync uses Bearer SYNC_TOKEN inside the handler)
  if (TOKEN_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return unauthorized(req, pathname);
  }

  let role: 'admin' | 'write' | 'read';
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const r = payload.role as string;
    if (r !== 'admin' && r !== 'write' && r !== 'read') {
      return unauthorized(req, pathname);
    }
    role = r;
  } catch {
    return unauthorized(req, pathname);
  }

  // Admin-only APIs
  if (
    ADMIN_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    if (role !== 'admin') {
      return NextResponse.json(
        { error: 'admin role required' },
        { status: 403 },
      );
    }
  }

  // Write method enforcement on API routes
  if (
    WRITE_METHODS.has(method) &&
    pathname.startsWith('/api/') &&
    !AUTHED_WRITE_EXEMPT.has(pathname)
  ) {
    if (role === 'read') {
      return NextResponse.json(
        { error: 'read-only account' },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}

function unauthorized(req: NextRequest, pathname: string) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL('/login', req.url);
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run middleware on everything except Next internals and static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.png|favicon\\.ico|logo\\.png).*)',
  ],
};
