import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import type { Role } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface UserRow {
  id: number;
  username: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, username, role, created_at, updated_at FROM users ORDER BY role DESC, username COLLATE NOCASE',
    )
    .all() as UserRow[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  const role = body.role as Role | undefined;

  if (!username || !password) {
    return NextResponse.json(
      { error: 'Benutzername und Passwort erforderlich' },
      { status: 400 },
    );
  }
  if (!role || !['admin', 'write', 'read'].includes(role)) {
    return NextResponse.json(
      { error: 'Rolle muss admin, write oder read sein' },
      { status: 400 },
    );
  }

  const db = getDb();
  const hash = await bcrypt.hash(password, 10);

  try {
    const info = db
      .prepare(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      )
      .run(username, hash, role);
    const user = db
      .prepare(
        'SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?',
      )
      .get(info.lastInsertRowid) as UserRow;
    return NextResponse.json(user);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE')) {
      return NextResponse.json(
        { error: 'Benutzername bereits vergeben' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
