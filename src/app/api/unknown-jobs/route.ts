import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  listIgnoredJobs,
  listUnknownJobs,
  setIgnored,
} from '@/lib/unknown-jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    unknown: listUnknownJobs(db),
    ignored: listIgnoredJobs(db),
  });
}

// Body: { name, ignored: boolean } — hide or unhide an unknown job name.
// Adding a job goes through POST /api/jobs, which adopts pending results.
export async function POST(req: NextRequest) {
  let body: { name?: unknown; ignored?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || typeof body.ignored !== 'boolean') {
    return NextResponse.json(
      { error: 'name and ignored (boolean) required' },
      { status: 400 },
    );
  }
  setIgnored(getDb(), name, body.ignored);
  return NextResponse.json({ ok: true });
}
