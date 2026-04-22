import { NextResponse } from 'next/server';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return res;
}
