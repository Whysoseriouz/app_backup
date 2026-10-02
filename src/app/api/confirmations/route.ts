import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-server';
import type { Confirmation, Status } from '@/lib/types';
import { SYNC_AUTHOR } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: Status[] = ['success', 'warning', 'failed'];

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { job_id, date, status, note, confirmed_by } = body as {
    job_id: number;
    date: string;
    status: Status;
    note?: string;
    confirmed_by?: string;
  };

  if (!job_id || !date || !status) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  // Non-admins always confirm in their own name. Admins may enter a name,
  // but never the sync author: a manual edit must not stay marked as
  // Veeam-Sync, otherwise the next sync run would overwrite it.
  const requested = confirmed_by?.trim();
  const author =
    me.role === 'admin' && requested && requested !== SYNC_AUTHOR
      ? requested
      : me.username;

  const db = getDb();
  db.prepare(
    `
    INSERT INTO confirmations (job_id, date, status, note, confirmed_by, confirmed_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(job_id, date) DO UPDATE SET
      status = excluded.status,
      note = excluded.note,
      confirmed_by = excluded.confirmed_by,
      confirmed_at = CURRENT_TIMESTAMP
  `,
  ).run(job_id, date, status, note || null, author);

  const updated = db
    .prepare('SELECT * FROM confirmations WHERE job_id = ? AND date = ?')
    .get(job_id, date) as Confirmation;
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const job_id = searchParams.get('job_id');
  const date = searchParams.get('date');
  if (!job_id || !date) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  const db = getDb();
  db.prepare('DELETE FROM confirmations WHERE job_id = ? AND date = ?').run(
    job_id,
    date,
  );
  return NextResponse.json({ ok: true });
}
