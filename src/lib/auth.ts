import { jwtVerify, SignJWT } from 'jose';

export type Role = 'admin' | 'write' | 'read';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  write: 'Schreiben',
  read: 'Lesen',
};

export const ROLE_BADGE: Record<Role, string> = {
  admin:
    'bg-osk-50 text-osk-700 ring-osk-600/20 dark:bg-osk-500/15 dark:text-osk-300 dark:ring-osk-400/30',
  write:
    'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30',
  read:
    'bg-slate-100 text-slate-700 ring-slate-400/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40',
};

export const COOKIE_NAME = 'backup-check:session';
export const COOKIE_MAX_AGE = 7 * 24 * 3600;

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
}

interface JwtPayloadShape {
  sub: string;
  username: string;
  role: Role;
  exp?: number;
  iat?: number;
}

function getSecret(): Uint8Array {
  const s =
    process.env.AUTH_SECRET ||
    'dev-fallback-please-set-AUTH_SECRET-in-production';
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return await new SignJWT({
    sub: String(user.id),
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifySession(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const p = payload as unknown as JwtPayloadShape;
    if (!p.sub || !p.username || !p.role) return null;
    if (!['admin', 'write', 'read'].includes(p.role)) return null;
    return {
      id: Number(p.sub),
      username: p.username,
      role: p.role,
    };
  } catch {
    return null;
  }
}

export function can(role: Role, requires: Role): boolean {
  const rank: Record<Role, number> = { read: 0, write: 1, admin: 2 };
  return rank[role] >= rank[requires];
}

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
}

export function sessionCookieOptions(
  maxAge: number | null = COOKIE_MAX_AGE,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    path: '/',
    ...(maxAge !== null ? { maxAge } : {}),
  };
}
