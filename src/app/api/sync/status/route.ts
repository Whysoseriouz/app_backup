import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const row = db
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

  return NextResponse.json({
    enabled: Boolean(process.env.SYNC_TOKEN),
    last_at: row.last_at,
    last_date: row.last_date,
    total: row.total,
  });
}
