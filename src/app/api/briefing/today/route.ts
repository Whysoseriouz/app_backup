import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-server';
import type { Status } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ConfRow {
  job_id: number;
  status: Status;
  note: string | null;
  confirmed_by: string | null;
  confirmed_at: string;
}

interface JobRow {
  id: number;
  name: string;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date =
    searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const db = getDb();

  const activeJobs = db
    .prepare('SELECT id, name FROM jobs WHERE active = 1 ORDER BY sort_order, name')
    .all() as JobRow[];

  const confirmations = db
    .prepare(
      `SELECT job_id, status, note, confirmed_by, confirmed_at
         FROM confirmations
        WHERE date = ?`,
    )
    .all(date) as ConfRow[];

  const byJobId = new Map<number, ConfRow>();
  for (const c of confirmations) byJobId.set(c.job_id, c);

  const counts = { success: 0, warning: 0, failed: 0, open: 0 };
  for (const j of activeJobs) {
    const c = byJobId.get(j.id);
    if (!c) counts.open++;
    else counts[c.status]++;
  }

  // Probleme: alle non-success Einträge, mit Job-Name
  const problems = confirmations
    .filter((c) => c.status !== 'success')
    .map((c) => ({
      job_id: c.job_id,
      job:
        activeJobs.find((j) => j.id === c.job_id)?.name ?? `#${c.job_id}`,
      status: c.status,
      note: c.note,
      confirmed_by: c.confirmed_by,
    }))
    .sort((a, b) => {
      // failed zuerst, dann warning
      const rank = { failed: 0, warning: 1 } as Record<string, number>;
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    });

  // Letzter Sync heute
  const syncRow = db
    .prepare(
      `SELECT MAX(confirmed_at) AS last_at, COUNT(*) AS n
         FROM confirmations
        WHERE confirmed_by = 'Veeam-Sync' AND date = ?`,
    )
    .get(date) as { last_at: string | null; n: number };

  const ackRow = db
    .prepare(
      'SELECT acked_at FROM briefing_ack WHERE user_id = ? AND date = ?',
    )
    .get(user.id, date) as { acked_at: string } | undefined;

  return NextResponse.json({
    date,
    total: activeJobs.length,
    counts,
    problems,
    lastSync: syncRow.last_at,
    syncedToday: syncRow.n,
    acked: !!ackRow,
    ackedAt: ackRow?.acked_at ?? null,
  });
}
