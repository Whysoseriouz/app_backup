import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'backup.db');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    migrate(dbInstance);
    seedIfEmpty(dbInstance);
    seedInitialAdmin(dbInstance);
  }
  return dbInstance;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'VMware Backup',
      target TEXT DEFAULT 'ASP_Backup_Scale-out-Repo',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success','warning','failed')),
      note TEXT,
      confirmed_by TEXT,
      confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(job_id, date),
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_confirmations_date
      ON confirmations(date);
    CREATE INDEX IF NOT EXISTS idx_confirmations_job_date
      ON confirmations(job_id, date);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','write','read')) DEFAULT 'read',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS briefing_ack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      acked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_briefing_user_date
      ON briefing_ack(user_id, date);
  `);
}

const VMWARE_JOBS = [
  'A-Cloud-CgLic-1',
  'a-cloud-exch-1',
  'ASP-Mgmtserver',
  'ASP-Mgmtserver Linux',
  'Cloud-Admin',
  'Cloud-Citrixserver',
  'Cloud-Datenbankserver',
  'Cloud-DMZ',
  'Cloud-Managementserver Linux',
  'Cloud-Managementserver Windows',
  'Cloud-Monitoring',
  'K01 Kundenserver',
  'K02 Kundenserver',
  'K02 Kundenserver Linux',
  'K03 Kundenserver',
  'K04 Kundenserver',
  'K05 Kundenserver',
  'K06 Kundenserver',
  'K07 Kundenserver',
  'K07 Kundenserver Linux',
  'K08 Kundenserver',
  'K08 Kundenserver Linux',
  'K09 Kundenserver',
  'K10 Kundenserver',
  'K11 Kundenserver',
  'K12 Kundenserver',
  'K13 Kundenserver',
  'K14 Kundenserver',
  'K15 Kundenserver',
  'K15 Kundenserver Linux',
  'K16 Kundenserver',
  'K17 Kundenserver',
  'K18 Kundenserver',
  'K18 Kundenserver Linux',
  'K19 Kundenserver',
  'K20 Kundenserver',
  'K21 Kundenserver',
  'K99 Kundenserver',
];

function seedInitialAdmin(db: Database.Database) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as {
    c: number;
  };
  if (row.c > 0) return;

  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'admin';
  const hash = bcrypt.hashSync(password, 10);

  db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
  ).run(username, hash, 'admin');

  console.log(
    `[backup-check] seeded initial admin user '${username}'` +
      (process.env.INITIAL_ADMIN_PASSWORD
        ? ' (password from env)'
        : " (default password: 'admin' - please change immediately)"),
  );
}

function seedIfEmpty(db: Database.Database) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM jobs').get() as {
    c: number;
  };
  if (row.c > 0) return;

  const insert = db.prepare(
    'INSERT INTO jobs (name, type, target, sort_order) VALUES (?, ?, ?, ?)',
  );
  const tx = db.transaction(() => {
    VMWARE_JOBS.forEach((name, i) =>
      insert.run(name, 'VMware Backup', 'ASP_Backup_Scale-out-Repo', i),
    );
    insert.run(
      'Workaround_VeeamAgent_File01-1',
      'Windows Agent Backup',
      'ASP_Backup_Scale-out-Repo',
      VMWARE_JOBS.length,
    );
  });
  tx();
}
