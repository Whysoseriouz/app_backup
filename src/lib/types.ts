export type Status = 'success' | 'warning' | 'failed';

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

export interface OverviewPayload {
  jobs: Job[];
  confirmations: Confirmation[];
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
