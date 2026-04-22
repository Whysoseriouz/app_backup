import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Status } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: Status[] = ['success', 'warning', 'failed'];
const SYNC_AUTHOR = 'Veeam-Sync';

interface SyncResult {
  job: string;
  status: string;
  note?: string | null;
}

export async function POST(req: NextRequest) {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'SYNC_TOKEN is not configured on the server' },
      { status: 503 },
    );
  }
  const auth = req.headers.get('authorization') || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const date = (body as { date?: string })?.date;
  const results = (body as { results?: SyncResult[] })?.results;
  if (!date || !Array.isArray(results)) {
    return NextResponse.json(
      { error: 'date (YYYY-MM-DD) and results[] required' },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date must be YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const db = getDb();
  const jobsByName = new Map<string, number>();
  for (const j of db
    .prepare('SELECT id, name FROM jobs')
    .all() as Array<{ id: number; name: string }>) {
    jobsByName.set(j.name.toLowerCase(), j.id);
  }

  const upsert = db.prepare(`
    INSERT INTO confirmations (job_id, date, status, note, confirmed_by, confirmed_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(job_id, date) DO UPDATE SET
      status = excluded.status,
      note = excluded.note,
      confirmed_by = excluded.confirmed_by,
      confirmed_at = CURRENT_TIMESTAMP
  `);

  const getExisting = db.prepare(
    'SELECT confirmed_by FROM confirmations WHERE job_id = ? AND date = ?',
  );

  const stats = {
    received: results.length,
    inserted: 0,
    updated: 0,
    skipped_manual: 0,
    unknown_jobs: [] as string[],
    invalid_status: [] as string[],
  };

  const tx = db.transaction(() => {
    for (const r of results) {
      if (!r || typeof r.job !== 'string' || typeof r.status !== 'string') {
        continue;
      }
      const status = r.status.toLowerCase() as Status;
      if (!VALID.includes(status)) {
        stats.invalid_status.push(r.job);
        continue;
      }
      const jobId = jobsByName.get(r.job.toLowerCase());
      if (!jobId) {
        stats.unknown_jobs.push(r.job);
        continue;
      }
      const existing = getExisting.get(jobId, date) as
        | { confirmed_by: string | null }
        | undefined;
      if (existing && existing.confirmed_by !== SYNC_AUTHOR) {
        stats.skipped_manual++;
        continue;
      }
      upsert.run(
        jobId,
        date,
        status,
        typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
        SYNC_AUTHOR,
      );
      if (existing) stats.updated++;
      else stats.inserted++;
    }
  });
  tx();

  return NextResponse.json({ date, ...stats });
}
