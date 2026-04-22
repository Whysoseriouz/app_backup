import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Job, Confirmation } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
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
  const jobs = db
    .prepare(
      'SELECT * FROM jobs WHERE active = 1 ORDER BY sort_order, name',
    )
    .all() as Job[];
  const confirmations = db
    .prepare(
      'SELECT * FROM confirmations WHERE date >= ? AND date <= ? ORDER BY date',
    )
    .all(start, end) as Confirmation[];

  return NextResponse.json({ jobs, confirmations });
}
