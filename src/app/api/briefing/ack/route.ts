import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { date?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const date = body.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date must be YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO briefing_ack (user_id, date, acked_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, date) DO UPDATE SET
       acked_at = CURRENT_TIMESTAMP`,
  ).run(user.id, date);

  const row = db
    .prepare('SELECT acked_at FROM briefing_ack WHERE user_id = ? AND date = ?')
    .get(user.id, date) as { acked_at: string };

  return NextResponse.json({ ackedAt: row.acked_at });
}

export async function DELETE(req: NextRequest) {
  // Allow user to "un-ack" (re-open) today's briefing if they clicked
  // too early and want to review again.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const date =
    searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const db = getDb();
  db.prepare('DELETE FROM briefing_ack WHERE user_id = ? AND date = ?').run(
    user.id,
    date,
  );
  return NextResponse.json({ ok: true });
}
