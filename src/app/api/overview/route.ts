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
      // Only active jobs: every view counts confirmations against the active
      // job list, so leftovers of deactivated jobs would skew open/done counts.
      `SELECT c.* FROM confirmations c
       JOIN jobs j ON j.id = c.job_id AND j.active = 1
       WHERE c.date >= ? AND c.date <= ? ORDER BY c.date`,
    )
    .all(start, end) as Confirmation[];

  return NextResponse.json({ jobs, confirmations });
}
