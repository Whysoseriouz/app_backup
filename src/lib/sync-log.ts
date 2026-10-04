import type Database from 'better-sqlite3';
import type {
  SyncConflict,
  SyncOutcome,
  SyncRun,
  SyncRunItem,
} from './types';

/** How long sync runs are kept in the protocol. */
const RETENTION_DAYS = 180;

export function startRun(db: Database.Database, date: string): number {
  db.prepare(
    `DELETE FROM sync_runs WHERE received_at < datetime('now', ?)`,
  ).run(`-${RETENTION_DAYS} days`);
  return Number(
    db.prepare('INSERT INTO sync_runs (date) VALUES (?)').run(date)
      .lastInsertRowid,
  );
}

export function logItem(
  db: Database.Database,
  runId: number,
  item: {
    job_name: string;
    job_id: number | null;
    status: string;
    note: string | null;
    outcome: SyncOutcome;
  },
) {
  db.prepare(
    `INSERT INTO sync_run_items (run_id, job_name, job_id, status, note, outcome)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(runId, item.job_name, item.job_id, item.status, item.note, item.outcome);
}

export function finishRun(
  db: Database.Database,
  runId: number,
  s: {
    received: number;
    inserted: number;
    updated: number;
    skipped_manual: number;
    unknown: number;
    invalid: number;
  },
) {
  db.prepare(
    `UPDATE sync_runs SET received = ?, inserted = ?, updated = ?,
       skipped_manual = ?, unknown = ?, invalid = ? WHERE id = ?`,
  ).run(
    s.received,
    s.inserted,
    s.updated,
    s.skipped_manual,
    s.unknown,
    s.invalid,
    runId,
  );
}

export function listRuns(db: Database.Database, limit: number): SyncRun[] {
  return db
    .prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?')
    .all(limit) as SyncRun[];
}

export function getRunItems(
  db: Database.Database,
  runId: number,
): SyncRunItem[] {
  return db
    .prepare(
      `SELECT job_name, job_id, status, note, outcome FROM sync_run_items
       WHERE run_id = ? ORDER BY job_name COLLATE NOCASE`,
    )
    .all(runId) as SyncRunItem[];
}

/** Latest thing the sync reported for one cell, if anything. */
export function getCellReport(
  db: Database.Database,
  jobId: number,
  date: string,
): (SyncRunItem & { received_at: string }) | null {
  return (
    (db
      .prepare(
        `SELECT i.job_name, i.job_id, i.status, i.note, i.outcome, r.received_at
         FROM sync_run_items i JOIN sync_runs r ON r.id = i.run_id
         WHERE i.job_id = ? AND r.date = ?
         ORDER BY i.run_id DESC LIMIT 1`,
      )
      .get(jobId, date) as (SyncRunItem & { received_at: string }) | undefined) ??
    null
  );
}

/**
 * Cells where the latest sync report was skipped because of a manual
 * confirmation, and Veeam reported a different status than what's stored.
 */
export function listConflicts(
  db: Database.Database,
  start: string,
  end: string,
): SyncConflict[] {
  return db
    .prepare(
      `SELECT i.job_id, r.date, i.status, i.note, r.received_at
       FROM sync_run_items i
       JOIN sync_runs r ON r.id = i.run_id
       JOIN confirmations c ON c.job_id = i.job_id AND c.date = r.date
       WHERE r.date >= ? AND r.date <= ?
         AND i.outcome = 'skipped_manual'
         AND i.status <> c.status
         AND i.run_id = (
           SELECT MAX(i2.run_id) FROM sync_run_items i2
           JOIN sync_runs r2 ON r2.id = i2.run_id
           WHERE i2.job_id = i.job_id AND r2.date = r.date
         )`,
    )
    .all(start, end) as SyncConflict[];
}
