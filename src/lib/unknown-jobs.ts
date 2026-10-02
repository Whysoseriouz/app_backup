import type Database from 'better-sqlite3';
import type { Status, UnknownJob } from './types';
import { SYNC_AUTHOR } from './types';

export function isIgnored(db: Database.Database, name: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM sync_ignored_jobs WHERE name = ?')
    .get(name);
}

export function recordUnknownResult(
  db: Database.Database,
  name: string,
  date: string,
  status: Status,
  note: string | null,
) {
  db.prepare(
    `INSERT INTO sync_unknown_results (name, date, status, note, received_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(name, date) DO UPDATE SET
       status = excluded.status,
       note = excluded.note,
       received_at = CURRENT_TIMESTAMP`,
  ).run(name, date, status, note);
}

export function listUnknownJobs(db: Database.Database): UnknownJob[] {
  // A name stops being "unknown" as soon as a job with that name exists,
  // even if it was created through the regular jobs form.
  return db
    .prepare(
      `SELECT r.name                AS name,
              COUNT(*)              AS count,
              MIN(r.date)           AS first_date,
              MAX(r.date)           AS last_date,
              (SELECT status FROM sync_unknown_results x
                WHERE x.name = r.name ORDER BY x.date DESC LIMIT 1) AS last_status
       FROM sync_unknown_results r
       WHERE r.name NOT IN (SELECT name FROM sync_ignored_jobs)
         AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.name = r.name COLLATE NOCASE)
       GROUP BY r.name
       ORDER BY MAX(r.date) DESC, r.name`,
    )
    .all() as UnknownJob[];
}

export function listIgnoredJobs(db: Database.Database): string[] {
  return (
    db
      .prepare('SELECT name FROM sync_ignored_jobs ORDER BY name')
      .all() as { name: string }[]
  ).map((r) => r.name);
}

/**
 * Called whenever a job gets a (new) name: imports the sync results that
 * arrived while the job didn't exist yet. Existing confirmations win.
 */
export function adoptUnknownResults(
  db: Database.Database,
  jobId: number,
  name: string,
): number {
  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO confirmations (job_id, date, status, note, confirmed_by, confirmed_at)
         SELECT ?, date, status, note, ?, received_at
         FROM sync_unknown_results WHERE name = ?
         ON CONFLICT(job_id, date) DO NOTHING`,
      )
      .run(jobId, SYNC_AUTHOR, name);
    db.prepare('DELETE FROM sync_unknown_results WHERE name = ?').run(name);
    db.prepare('DELETE FROM sync_ignored_jobs WHERE name = ?').run(name);
    return res.changes;
  });
  return tx();
}

export function setIgnored(
  db: Database.Database,
  name: string,
  ignored: boolean,
) {
  if (ignored) {
    db.transaction(() => {
      db.prepare(
        'INSERT INTO sync_ignored_jobs (name) VALUES (?) ON CONFLICT(name) DO NOTHING',
      ).run(name);
      db.prepare('DELETE FROM sync_unknown_results WHERE name = ?').run(name);
    })();
  } else {
    db.prepare('DELETE FROM sync_ignored_jobs WHERE name = ?').run(name);
  }
}
