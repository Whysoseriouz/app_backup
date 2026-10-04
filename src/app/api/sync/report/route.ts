import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCellReport } from '@/lib/sync-log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Latest sync report for one matrix cell: ?job_id=..&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const jobId = Number(req.nextUrl.searchParams.get('job_id'));
  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!Number.isInteger(jobId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'job_id and date required' }, { status: 400 });
  }
  return NextResponse.json({ report: getCellReport(getDb(), jobId, date) });
}
