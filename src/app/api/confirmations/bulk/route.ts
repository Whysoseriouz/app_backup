import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Status } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: Status[] = ['success', 'warning', 'failed'];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, status, confirmed_by, overwrite } = body as {
    date: string;
    status: Status;
    confirmed_by?: string;
    overwrite?: boolean;
  };

  if (!date || !status) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const db = getDb();
  const jobs = db
    .prepare('SELECT id FROM jobs WHERE active = 1')
    .all() as { id: number }[];

  const onConflict = overwrite
    ? `UPDATE SET status = excluded.status,
                 confirmed_by = excluded.confirmed_by,
                 confirmed_at = CURRENT_TIMESTAMP`
    : 'NOTHING';

  const insert = db.prepare(`
    INSERT INTO confirmations (job_id, date, status, confirmed_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(job_id, date) DO ${onConflict}
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const j of jobs) {
      const res = insert.run(j.id, date, status, confirmed_by || null);
      if (res.changes > 0) inserted++;
    }
  });
  tx();

  return NextResponse.json({ inserted });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
  }
  const db = getDb();
  const res = db
    .prepare('DELETE FROM confirmations WHERE date = ?')
    .run(date);
  return NextResponse.json({ deleted: res.changes });
}
