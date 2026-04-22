import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-server';
import { type Role } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface UserRow {
  id: number;
  username: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { username?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const db = getDb();
  const target = db
    .prepare(
      'SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?',
    )
    .get(targetId) as UserRow | undefined;
  if (!target) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // If demoting/changing role of the sole admin, block
  if (body.role !== undefined && target.role === 'admin' && body.role !== 'admin') {
    const adminCount = (
      db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as {
        c: number;
      }
    ).c;
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Der letzte Admin kann nicht degradiert werden.' },
        { status: 409 },
      );
    }
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.username !== undefined) {
    const u = body.username.trim();
    if (!u) {
      return NextResponse.json(
        { error: 'Benutzername darf nicht leer sein' },
        { status: 400 },
      );
    }
    updates.push('username = ?');
    values.push(u);
  }

  if (body.role !== undefined) {
    if (!['admin', 'write', 'read'].includes(body.role)) {
      return NextResponse.json(
        { error: 'Rolle muss admin, write oder read sein' },
        { status: 400 },
      );
    }
    updates.push('role = ?');
    values.push(body.role);
  }

  if (body.password !== undefined && body.password.length > 0) {
    const hash = await bcrypt.hash(body.password, 10);
    updates.push('password_hash = ?');
    values.push(hash);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(targetId);

  try {
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(
      ...values,
    );
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

  const updated = db
    .prepare(
      'SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?',
    )
    .get(targetId) as UserRow;
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (me.id === targetId) {
    return NextResponse.json(
      { error: 'Eigener Account kann nicht gelöscht werden' },
      { status: 409 },
    );
  }

  const db = getDb();
  const target = db
    .prepare('SELECT role FROM users WHERE id = ?')
    .get(targetId) as { role: Role } | undefined;
  if (!target) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (target.role === 'admin') {
    const adminCount = (
      db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as {
        c: number;
      }
    ).c;
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Der letzte Admin kann nicht gelöscht werden' },
        { status: 409 },
      );
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  return NextResponse.json({ ok: true });
}
