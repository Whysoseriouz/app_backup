import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import {
  COOKIE_NAME,
  sessionCookieOptions,
  signSession,
  type Role,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  if (!username || !password) {
    return NextResponse.json(
      { error: 'Benutzername und Passwort erforderlich' },
      { status: 400 },
    );
  }

  const db = getDb();
  const row = db
    .prepare(
      'SELECT id, username, password_hash, role FROM users WHERE username = ? COLLATE NOCASE',
    )
    .get(username) as
    | { id: number; username: string; password_hash: string; role: Role }
    | undefined;

  if (!row) {
    return NextResponse.json(
      { error: 'Benutzername oder Passwort falsch' },
      { status: 401 },
    );
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: 'Benutzername oder Passwort falsch' },
      { status: 401 },
    );
  }

  const user = { id: row.id, username: row.username, role: row.role };
  const token = await signSession(user);

  const res = NextResponse.json({ user });
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
