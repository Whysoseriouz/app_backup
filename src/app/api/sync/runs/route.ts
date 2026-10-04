import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listRuns } from '@/lib/sync-log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get('limit')) || 60, 1),
    500,
  );
  return NextResponse.json(listRuns(getDb(), limit));
}
