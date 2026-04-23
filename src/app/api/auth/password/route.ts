import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { current?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const current = body.current;
  const next = body.next;
  if (!current || !next) {
    return NextResponse.json(
      { error: 'Aktuelles und neues Passwort erforderlich' },
      { status: 400 },
    );
  }
  if (next.length < 1) {
    return NextResponse.json(
      { error: 'Neues Passwort darf nicht leer sein' },
      { status: 400 },
    );
  }

  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(user.id) as { password_hash: string } | undefined;
  if (!row) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  const ok = await bcrypt.compare(current, row.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: 'Aktuelles Passwort ist falsch' },
      { status: 401 },
    );
  }

  const hash = await bcrypt.hash(next, 10);
  db.prepare(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(hash, user.id);

  return NextResponse.json({ ok: true });
}
