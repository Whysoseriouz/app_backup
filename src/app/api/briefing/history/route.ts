import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end) {
    return NextResponse.json(
      { error: 'start and end required' },
      { status: 400 },
    );
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT date, acked_at
         FROM briefing_ack
        WHERE user_id = ? AND date >= ? AND date <= ?
        ORDER BY date`,
    )
    .all(user.id, start, end) as Array<{ date: string; acked_at: string }>;

  return NextResponse.json({
    acks: rows.map((r) => ({ date: r.date, ackedAt: r.acked_at })),
  });
}
