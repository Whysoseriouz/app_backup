import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-server';
import type { DailyCheck } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Body: { date: 'YYYY-MM-DD', note?: string } – signs off the day for the
// logged-in user and stores how the matrix looked at that moment.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { date?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const date = typeof body.date === 'string' ? body.date : '';
  if (!ISO.test(date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 });
  }
  const note =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  const db = getDb();
  const existing = db
    .prepare('SELECT checked_by FROM daily_checks WHERE date = ?')
    .get(date) as { checked_by: string } | undefined;
  if (existing) {
    return NextResponse.json(
      { error: `Bereits kontrolliert von ${existing.checked_by}` },
      { status: 409 },
    );
  }

  const snap = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM jobs WHERE active = 1) AS total_jobs,
         SUM(c.status = 'warning') AS warning_count,
         SUM(c.status = 'failed')  AS failed_count,
         COUNT(c.job_id)           AS confirmed
       FROM jobs j
       LEFT JOIN confirmations c ON c.job_id = j.id AND c.date = ?
       WHERE j.active = 1`,
    )
    .get(date) as {
    total_jobs: number;
    warning_count: number | null;
    failed_count: number | null;
    confirmed: number;
  };

  db.prepare(
    `INSERT INTO daily_checks
       (date, checked_by, note, total_jobs, open_count, warning_count, failed_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    date,
    me.username,
    note,
    snap.total_jobs,
    snap.total_jobs - snap.confirmed,
    snap.warning_count ?? 0,
    snap.failed_count ?? 0,
  );

  const row = db
    .prepare('SELECT * FROM daily_checks WHERE date = ?')
    .get(date) as DailyCheck;
  return NextResponse.json(row);
}

// ?date=YYYY-MM-DD – withdraw a sign-off: own one, or any as admin.
export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!ISO.test(date)) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
  }
  const db = getDb();
  const row = db
    .prepare('SELECT checked_by FROM daily_checks WHERE date = ?')
    .get(date) as { checked_by: string } | undefined;
  if (!row) return NextResponse.json({ ok: true });
  if (me.role !== 'admin' && row.checked_by.toLowerCase() !== me.username.toLowerCase()) {
    return NextResponse.json(
      { error: 'Nur die eigene Kontrolle kann zurückgenommen werden.' },
      { status: 403 },
    );
  }
  db.prepare('DELETE FROM daily_checks WHERE date = ?').run(date);
  return NextResponse.json({ ok: true });
}
