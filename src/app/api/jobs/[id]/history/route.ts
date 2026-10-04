import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listConflicts } from '@/lib/sync-log';
import type { Confirmation, Job } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Confirmations of one job for the last ?days=N days (default 60).
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const id = Number((await ctx.params).id);
  const days = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get('days')) || 60, 1),
    366,
  );
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
    | Job
    | undefined;
  if (!job) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const confirmations = db
    .prepare(
      `SELECT * FROM confirmations
       WHERE job_id = ? AND date >= date('now', 'localtime', ?)
       ORDER BY date DESC`,
    )
    .all(id, `-${days} days`) as Confirmation[];
  const from = confirmations.at(-1)?.date;
  const conflicts = from
    ? listConflicts(db, from, '9999-12-31').filter((c) => c.job_id === id)
    : [];
  return NextResponse.json({ job, confirmations, conflicts });
}
