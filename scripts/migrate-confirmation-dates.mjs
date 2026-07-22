#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';

const MIGRATION_NAME = 'confirmation-date-semantics-v1';
const TEMP_PREFIX = 'MIG:';

function usage(exitCode = 0) {
  console.log(`
Backup Check: historische Quittierungsdaten auf den Sicherungstag verschieben

Vorschau:
  node scripts/migrate-confirmation-dates.mjs --db <backup.db> --through YYYY-MM-DD

Ausfuehren (App/Container muss gestoppt sein):
  node scripts/migrate-confirmation-dates.mjs --db <backup.db> --through YYYY-MM-DD --apply --app-stopped

--through ist der letzte Tag, der noch nach der alten Logik als Pruef-/Syncdatum
gespeichert wurde. Alle Quittierungen bis einschliesslich dieses Tages werden um
einen Kalendertag zurueckgesetzt. confirmed_at, Status, Notizen und Benutzer
bleiben unveraendert.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { apply: false, appStopped: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--app-stopped') {
      options.appStopped = true;
      continue;
    }
    if (arg === '--db' || arg === '--through') {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === '--db') options.db = value;
      else options.through = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function migrationAlreadyApplied(db) {
  const table = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_migrations'")
    .get();
  if (!table) return null;
  return db
    .prepare('SELECT name, applied_at, details FROM app_migrations WHERE name = ?')
    .get(MIGRATION_NAME);
}

function inspect(db, through) {
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);

  const invalid = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM confirmations
      WHERE date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
         OR date(date) IS NULL
         OR date LIKE ?
    `)
    .get(`${TEMP_PREFIX}%`).count;
  if (invalid > 0) throw new Error(`Found ${invalid} invalid or temporary date values`);

  const affected = db
    .prepare(`
      SELECT COUNT(*) AS rows,
             COUNT(DISTINCT job_id) AS jobs,
             COUNT(DISTINCT date) AS days,
             MIN(date) AS first_date,
             MAX(date) AS last_date,
             MIN(date(date, '-1 day')) AS projected_first_date,
             MAX(date(date, '-1 day')) AS projected_last_date
      FROM confirmations
      WHERE date <= ?
    `)
    .get(through);

  const database = db
    .prepare(`
      SELECT COUNT(*) AS rows, MIN(date) AS first_date, MAX(date) AS last_date
      FROM confirmations
    `)
    .get();

  const sources = db
    .prepare(`
      SELECT COALESCE(confirmed_by, '<leer>') AS source, COUNT(*) AS rows
      FROM confirmations
      WHERE date <= ?
      GROUP BY confirmed_by
      ORDER BY rows DESC
    `)
    .all(through);

  return { database, affected, sources };
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  usage(2);
}

if (!options.db || !options.through) usage(2);
if (!isIsoDate(options.through)) {
  throw new Error(`Invalid --through date '${options.through}'; expected YYYY-MM-DD`);
}
if (options.apply && !options.appStopped) {
  throw new Error('Refusing to write: stop the app/container and add --app-stopped');
}

const dbPath = path.resolve(options.db);
if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);

const previewDb = new Database(dbPath, { readonly: true, fileMustExist: true });
const existingMigration = migrationAlreadyApplied(previewDb);
if (existingMigration) {
  previewDb.close();
  throw new Error(
    `Migration already applied at ${existingMigration.applied_at}: ${existingMigration.details}`,
  );
}
const preview = inspect(previewDb, options.through);
previewDb.close();

console.log('Database     :', dbPath);
console.log('Through date :', options.through);
console.log('Rows          :', preview.affected.rows);
console.log('Jobs          :', preview.affected.jobs);
console.log('Days          :', preview.affected.days);
console.log(
  'Date range    :',
  `${preview.affected.first_date} .. ${preview.affected.last_date}`,
  '->',
  `${preview.affected.projected_first_date} .. ${preview.affected.projected_last_date}`,
);
for (const source of preview.sources) {
  console.log(`Source        : ${source.source} = ${source.rows}`);
}

if (!options.apply) {
  console.log('\nDRY RUN: no data changed.');
  process.exit(0);
}
if (preview.affected.rows === 0) throw new Error('No rows match the requested cutoff date');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${dbPath}.before-date-migration-${timestamp}.bak`;
const db = new Database(dbPath, { fileMustExist: true });
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

console.log('\nCreating SQLite backup:', backupPath);
await db.backup(backupPath);
const backupHash = sha256(backupPath);

const migrate = db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      details TEXT NOT NULL
    )
  `);

  if (migrationAlreadyApplied(db)) throw new Error('Migration marker already exists');

  // Phase 1 uses a temporary namespace to avoid transient UNIQUE(job_id,date)
  // collisions while consecutive calendar days are shifted.
  const phase1 = db
    .prepare(`UPDATE confirmations SET date = ? || date WHERE date <= ?`)
    .run(TEMP_PREFIX, options.through);
  if (phase1.changes !== preview.affected.rows) {
    throw new Error(`Expected ${preview.affected.rows} rows in phase 1, changed ${phase1.changes}`);
  }

  const phase2 = db
    .prepare(`
      UPDATE confirmations
      SET date = date(substr(date, ?), '-1 day')
      WHERE date LIKE ?
    `)
    .run(TEMP_PREFIX.length + 1, `${TEMP_PREFIX}%`);
  if (phase2.changes !== preview.affected.rows) {
    throw new Error(`Expected ${preview.affected.rows} rows in phase 2, changed ${phase2.changes}`);
  }

  db.prepare('INSERT INTO app_migrations (name, details) VALUES (?, ?)').run(
    MIGRATION_NAME,
    JSON.stringify({ through: options.through, rows: phase2.changes, backup: backupPath }),
  );
});

try {
  migrate.immediate();
  const after = db
    .prepare(`
      SELECT COUNT(*) AS rows,
             MIN(date) AS first_date,
             MAX(date) AS last_date,
             SUM(date LIKE ?) AS temporary_dates
      FROM confirmations
    `)
    .get(`${TEMP_PREFIX}%`);
  if (after.rows !== preview.database.rows) {
    throw new Error(`Row count changed from ${preview.database.rows} to ${after.rows}`);
  }
  if (after.temporary_dates !== 0) {
    throw new Error(`Found ${after.temporary_dates} temporary date values after migration`);
  }
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`Post-migration integrity check failed: ${integrity}`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  console.log('\nMigration complete.');
  console.log('Shifted rows  :', preview.affected.rows);
  console.log('Backup SHA256 :', backupHash);
  console.log('Backup file   :', backupPath);
  console.log('New date range:', `${after.first_date} .. ${after.last_date}`);
} finally {
  db.close();
}
