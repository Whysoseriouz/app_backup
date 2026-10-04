import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const imported = db
    .prepare(
      `SELECT MAX(confirmed_at) AS last_at,
              COUNT(*)           AS total,
              MAX(date)          AS last_date
       FROM confirmations
       WHERE confirmed_by = 'Veeam-Sync'`,
    )
    .get() as {
    last_at: string | null;
    total: number;
    last_date: string | null;
  };
  // A sync run counts even if every result was skipped (e.g. the day was
  // already confirmed manually), so prefer the protocol when it has data.
  const run = db
    .prepare(
      'SELECT MAX(received_at) AS last_at, MAX(date) AS last_date FROM sync_runs',
    )
    .get() as { last_at: string | null; last_date: string | null };

  return NextResponse.json({
    enabled: Boolean(process.env.SYNC_TOKEN),
    last_at: run.last_at ?? imported.last_at,
    last_date: run.last_date ?? imported.last_date,
    total: imported.total,
  });
}
