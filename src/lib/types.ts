export type Status = 'success' | 'warning' | 'failed';

// confirmed_by value reserved for /api/sync. Rows with this author may be
// overwritten by the next sync run; any other author marks a manual edit.
export const SYNC_AUTHOR = 'Veeam-Sync';

export interface Job {
  id: number;
  name: string;
  type: string;
  target: string;
  active: number;
  sort_order: number;
  created_at: string;
}

export interface Confirmation {
  id: number;
  job_id: number;
  date: string;
  status: Status;
  note: string | null;
  confirmed_by: string | null;
  confirmed_at: string;
}

export const JOB_TYPES = [
  'VMware Backup',
  'Windows Agent Backup',
  'Linux Agent Backup',
  'NAS Backup',
  'Backup Copy',
];

/** Job name reported by the Veeam sync that doesn't exist in the portal. */
export interface UnknownJob {
  name: string;
  count: number;
  first_date: string;
  last_date: string;
  last_status: Status;
}

export type SyncOutcome =
  | 'inserted'
  | 'updated'
  | 'skipped_manual'
  | 'unknown'
  | 'invalid';

export const SYNC_OUTCOME_LABEL: Record<SyncOutcome, string> = {
  inserted: 'Eingetragen',
  updated: 'Aktualisiert',
  skipped_manual: 'Übersprungen (manuell quittiert)',
  unknown: 'Unbekannter Job',
  invalid: 'Ungültiger Status',
};

export interface SyncRun {
  id: number;
  received_at: string;
  date: string;
  received: number;
  inserted: number;
  updated: number;
  skipped_manual: number;
  unknown: number;
  invalid: number;
}

export interface SyncRunItem {
  job_name: string;
  job_id: number | null;
  status: string;
  note: string | null;
  outcome: SyncOutcome;
}

/** Veeam reported something else than the (manual) confirmation says. */
export interface SyncConflict {
  job_id: number;
  date: string;
  status: Status;
  note: string | null;
  received_at: string;
}

export interface OverviewPayload {
  jobs: Job[];
  confirmations: Confirmation[];
  conflicts?: SyncConflict[];
}

export const STATUS_META: Record<
  Status,
  { label: string; dot: string; ring: string; badge: string; solid: string }
> = {
  success: {
    label: 'Erfolg',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-400/30',
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30',
    solid: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  },
  warning: {
    label: 'Warnung',
    dot: 'bg-amber-500',
    ring: 'ring-amber-400/30',
    badge:
      'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
    solid: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  failed: {
    label: 'Fehler',
    dot: 'bg-rose-500',
    ring: 'ring-rose-400/30',
    badge:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30',
    solid: 'bg-rose-500 hover:bg-rose-600 text-white',
  },
};
