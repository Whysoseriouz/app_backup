import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Job } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const jobs = db
    .prepare('SELECT * FROM jobs ORDER BY active DESC, sort_order, name')
    .all() as Job[];
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name as string | undefined)?.trim();
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const type = (body.type as string | undefined) || 'VMware Backup';
  const target =
    (body.target as string | undefined) || 'ASP_Backup_Scale-out-Repo';

  const db = getDb();
  const maxRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM jobs')
    .get() as { n: number };

  try {
    const info = db
      .prepare(
        'INSERT INTO jobs (name, type, target, sort_order) VALUES (?, ?, ?, ?)',
      )
      .run(name, type, target, maxRow.n);
    const job = db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(info.lastInsertRowid) as Job;
    return NextResponse.json(job);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    const code = msg.includes('UNIQUE') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
