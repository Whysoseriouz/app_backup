'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Activity,
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CircleX,
  Cloud,
  Clock3,
  RefreshCw,
  Repeat2,
  Sunrise,
  TriangleAlert,
} from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { UnknownJobsPanel } from '@/components/UnknownJobsPanel';
import { CellPopover } from '@/components/CellPopover';
import { StatusDot } from '@/components/StatusDot';
import { JobHistoryDialog } from '@/components/JobHistoryDialog';
import { useCan, useCurrentUser } from '@/components/CurrentUserContext';
import { usePageBusy } from '@/lib/navigation';
import {
  errorMessage,
  fetchJson,
  notify,
  revalidateConfirmations,
} from '@/lib/api';
import { withBulkSuccess, withDelete, withUpsert } from '@/lib/optimistic';
import {
  addDays,
  formatLong,
  formatUtcDateTime,
  fromISO,
  lastBackupDateISO,
  toISO,
} from '@/lib/date';
import type {
  Confirmation,
  Job,
  OverviewPayload,
  Status,
  SyncConflict,
} from '@/lib/types';
import { STATUS_META, SYNC_AUTHOR } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SyncStatus {
  enabled: boolean;
  last_at: string | null;
  last_date: string | null;
  total: number;
}

interface DaySummary {
  date: string;
  success: number;
  warning: number;
  failed: number;
  open: number;
}

/**
 * One row in the Fehler/Warnungen panels: either a confirmation with that
 * status, or a sync report that differs from a manual confirmation.
 */
interface IssueItem {
  jobId: number;
  status: Status;
  note: string | null;
  at: string;
  by: string | null;
  confirmation?: Confirmation;
  /** Set for sync conflicts: what the (manual) confirmation says. */
  manualStatus?: Status;
}

/** Shared cell actions handed down to the panels. */
interface CellActions {
  date: string;
  canWrite: boolean;
  onSave: (
    jobId: number,
    status: Status,
    note: string | null,
    by: string | null,
  ) => Promise<void>;
  onClear: (jobId: number) => Promise<void>;
  onOpenJob: (jobId: number) => void;
}

interface RecurringIssue {
  jobId: number;
  name: string;
  failed: number;
  warning: number;
  total: number;
}

const DAY_FORMAT = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
});

export default function DashboardPage() {
  const [backupDate, setBackupDate] = useState<string | null>(null);
  const canWrite = useCan('write');
  const { user } = useCurrentUser();
  // Day picked in the 7-day trend; null = latest backup date.
  const [selected, setSelected] = useState<string | null>(null);
  const [historyJob, setHistoryJob] = useState<Job | null>(null);

  useEffect(() => setBackupDate(lastBackupDateISO()), []);
  const day = selected ?? backupDate;

  // Cached: coming back to the briefing shows the last state at once and
  // refreshes in the background (also every minute and on tab focus).
  const overviewKey = backupDate
    ? `/api/overview?start=${toISO(addDays(fromISO(backupDate), -6))}&end=${backupDate}`
    : null;
  const {
    data,
    isLoading: loading,
    isValidating,
    mutate,
  } = useSWR<OverviewPayload>(overviewKey, { refreshInterval: 60_000 });
  const {
    data: syncStatus,
    isValidating: syncValidating,
    mutate: mutateSync,
  } = useSWR<SyncStatus>('/api/sync/status', { refreshInterval: 60_000 });
  const refreshing = isValidating || syncValidating;
  usePageBusy(!backupDate || loading || !data);
  const load = useCallback(() => {
    void mutate();
    void mutateSync();
  }, [mutate, mutateSync]);

  // Same pattern as the matrix: update at once, save in the background,
  // roll back with a toast on failure.
  async function optimistic(
    update: (d: OverviewPayload | undefined) => OverviewPayload | undefined,
    request: () => Promise<unknown>,
    failure: string,
  ) {
    try {
      await mutate(
        async () => {
          await request();
          return undefined;
        },
        {
          optimisticData: (cur) => update(cur) ?? { jobs: [], confirmations: [] },
          rollbackOnError: true,
          populateCache: false,
          revalidate: true,
        },
      );
      void revalidateConfirmations();
    } catch (e) {
      notify(`${failure}: ${errorMessage(e)}`);
    }
  }

  const jobs = useMemo(() => data?.jobs ?? [], [data]);
  const currentConfirmations = useMemo(
    () => data?.confirmations.filter((item) => item.date === day) ?? [],
    [data, day],
  );
  const dayConflicts = useMemo<SyncConflict[]>(
    () => data?.conflicts?.filter((c) => c.date === day) ?? [],
    [data, day],
  );
  // NavBar badge always refers to the latest backup date.
  const latestOpenCount = useMemo(() => {
    if (!data || !backupDate) return 0;
    const done = new Set(
      data.confirmations
        .filter((c) => c.date === backupDate)
        .map((c) => c.job_id),
    );
    return data.jobs.filter((j) => !done.has(j.id)).length;
  }, [data, backupDate]);
  const confirmationsByJob = useMemo(
    () => new Map(currentConfirmations.map((item) => [item.job_id, item])),
    [currentConfirmations],
  );
  const jobsById = useMemo(
    () => new Map(jobs.map((job) => [job.id, job])),
    [jobs],
  );
  const counts = useMemo(() => {
    const result = { success: 0, warning: 0, failed: 0 };
    for (const item of currentConfirmations) result[item.status]++;
    return result;
  }, [currentConfirmations]);
  const openJobs = useMemo(
    () => jobs.filter((job) => !confirmationsByJob.has(job.id)),
    [jobs, confirmationsByJob],
  );
  const issuesFor = useCallback(
    (status: Status): IssueItem[] => [
      ...currentConfirmations
        .filter((c) => c.status === status)
        .map((c) => ({
          jobId: c.job_id,
          status: c.status,
          note: c.note,
          at: c.confirmed_at,
          by: c.confirmed_by,
          confirmation: c,
        })),
      ...dayConflicts
        .filter((c) => c.status === status)
        .map((c) => {
          const conf = confirmationsByJob.get(c.job_id);
          return {
            jobId: c.job_id,
            status: c.status,
            note: c.note,
            at: c.received_at,
            by: SYNC_AUTHOR,
            confirmation: conf,
            manualStatus: conf?.status,
          };
        }),
    ],
    [currentConfirmations, dayConflicts, confirmationsByJob],
  );
  const failedItems = useMemo(() => issuesFor('failed'), [issuesFor]);
  const warningItems = useMemo(() => issuesFor('warning'), [issuesFor]);
  const trend = useMemo<DaySummary[]>(() => {
    if (!backupDate || !data) return [];
    const end = fromISO(backupDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = toISO(addDays(end, index - 6));
      const items = data.confirmations.filter((item) => item.date === date);
      const day: DaySummary = {
        date,
        success: 0,
        warning: 0,
        failed: 0,
        open: Math.max(0, jobs.length - items.length),
      };
      for (const item of items) day[item.status]++;
      return day;
    });
  }, [backupDate, data, jobs.length]);
  const healthyDays = useMemo(
    () =>
      trend.filter(
        (day) => day.failed === 0 && day.warning === 0 && day.open === 0,
      ).length,
    [trend],
  );
  const recurringIssues = useMemo<RecurringIssue[]>(() => {
    if (!data) return [];
    const grouped = new Map<number, RecurringIssue>();
    for (const item of data.confirmations) {
      if (item.status === 'success') continue;
      const job = jobsById.get(item.job_id);
      if (!job) continue;
      const current = grouped.get(item.job_id) ?? {
        jobId: item.job_id,
        name: job.name,
        failed: 0,
        warning: 0,
        total: 0,
      };
      current[item.status]++;
      current.total++;
      grouped.set(item.job_id, current);
    }
    return [...grouped.values()]
      .filter((item) => item.total > 1)
      .sort((a, b) => b.total - a.total || b.failed - a.failed)
      .slice(0, 3);
  }, [data, jobsById]);

  const trendDates = useMemo(() => trend.map((d) => d.date), [trend]);
  const shiftDay = useCallback(
    (dir: -1 | 1) => {
      if (!day || !backupDate) return;
      const idx = trendDates.indexOf(day) + dir;
      if (idx < 0 || idx >= trendDates.length) return;
      const next = trendDates[idx];
      setSelected(next === backupDate ? null : next);
    },
    [day, backupDate, trendDates],
  );

  // ←/→ switch the day, unless the user is typing or a popup is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement;
      if (
        t.closest(
          'input, textarea, select, [role=dialog], [data-radix-popper-content-wrapper]',
        )
      )
        return;
      e.preventDefault();
      shiftDay(e.key === 'ArrowLeft' ? -1 : 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shiftDay]);

  const actions: CellActions | null = day
    ? {
        date: day,
        canWrite,
        onSave: (jobId, status, note, by) =>
          optimistic(
            (d) =>
              withUpsert(d, {
                job_id: jobId,
                date: day,
                status,
                note,
                confirmed_by: by ?? user?.username ?? null,
              }),
            () =>
              fetchJson('/api/confirmations', {
                method: 'POST',
                json: { job_id: jobId, date: day, status, note, confirmed_by: by },
              }),
            'Speichern fehlgeschlagen',
          ),
        onClear: (jobId) =>
          optimistic(
            (d) => withDelete(d, jobId, day),
            () =>
              fetchJson(`/api/confirmations?job_id=${jobId}&date=${day}`, {
                method: 'DELETE',
              }),
            'Zurücksetzen fehlgeschlagen',
          ),
        onOpenJob: (jobId) => setHistoryJob(jobsById.get(jobId) ?? null),
      }
    : null;

  async function confirmRest() {
    if (!day) return;
    await optimistic(
      (d) => withBulkSuccess(d, day, user?.username ?? null),
      () =>
        fetchJson('/api/confirmations/bulk', {
          method: 'POST',
          json: { date: day, status: 'success', overwrite: false },
        }),
      'Quittieren fehlgeschlagen',
    );
  }

  if (!backupDate || !day || !actions || loading || !data) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="mx-auto max-w-[1800px] px-5 py-5">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  const confirmed = currentConfirmations.length;
  const completion = jobs.length ? Math.round((confirmed / jobs.length) * 100) : 0;
  const state = getState(counts, openJobs.length, dayConflicts.length);
  const isLatest = day === backupDate;
  const dayIdx = trendDates.indexOf(day);

  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
    <div className="min-h-screen">
      <NavBar badge={latestOpenCount} badgeDate={formatLong(fromISO(backupDate))} />

      <main className="mx-auto max-w-[1800px] px-5 pb-3 pt-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn('rounded-xl p-2.5', state.icon)}>
              <Sunrise className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                  Morning Briefing
                </h1>
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1', state.badge)}>
                  {state.label}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Sicherungstag {formatLong(fromISO(day))}
                {!isLatest && (
                  <span className="ml-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30">
                    Rückblick
                  </span>
                )}{' '}
                · {state.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg ring-1 ring-slate-200 overflow-hidden dark:ring-slate-800">
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                disabled={dayIdx <= 0}
                aria-label="Vorheriger Sicherungstag"
                title="Vorheriger Sicherungstag (←)"
                className="inline-flex h-9 w-9 items-center justify-center text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={isLatest}
                title="Zum neuesten Sicherungstag"
                className="h-9 px-3 text-sm font-medium text-slate-700 border-x border-slate-200 transition hover:bg-white disabled:cursor-default disabled:hover:bg-transparent dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                {isLatest ? 'Neuester Tag' : 'Zum neuesten'}
              </button>
              <button
                type="button"
                onClick={() => shiftDay(1)}
                disabled={isLatest}
                aria-label="Nächster Sicherungstag"
                title="Nächster Sicherungstag (→)"
                className="inline-flex h-9 w-9 items-center justify-center text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={refreshing}
              aria-label="Dashboard aktualisieren"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:ring-slate-800 dark:hover:bg-slate-900 dark:hover:text-white"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
            <Link
              href="/overview"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Matrix
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <UnknownJobsPanel onChanged={load} className="mt-4" />

        <section className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:grid-cols-5">
          <Metric label="Erfolgreich" value={counts.success} icon={CheckCircle2} tone="emerald" href="/overview" />
          <Metric label="Warnungen" value={counts.warning} icon={TriangleAlert} tone="amber" href="/overview?filter=problems" />
          <Metric label="Fehler" value={counts.failed} icon={CircleX} tone="rose" href="/overview?filter=problems" />
          <Metric label="Offen" value={openJobs.length} icon={CircleDashed} tone="slate" href="/overview?filter=open" />
          <Metric label="Vollständig" value={`${completion} %`} icon={Activity} tone="osk" last />
        </section>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(230px,0.8fr)]">
          <IssuePanel
            eyebrow="Kritisch"
            title="Fehler"
            items={failedItems}
            jobsById={jobsById}
            tone="failed"
            actions={actions}
          />
          <IssuePanel
            eyebrow="Kontrollieren"
            title="Warnungen"
            items={warningItems}
            jobsById={jobsById}
            tone="warning"
            actions={actions}
          />
          <aside className="grid gap-4">
            <OpenPanel
              jobs={openJobs}
              completed={confirmed}
              total={jobs.length}
              completion={completion}
              actions={actions}
              onConfirmRest={confirmRest}
            />
            <SyncPanel
              status={syncStatus ?? null}
              backupDate={backupDate}
              conflicts={dayConflicts.length}
            />
          </aside>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(230px,0.8fr)]">
          <section className="rounded-2xl bg-white px-5 py-3 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 md:col-span-2">
            <SectionHeader
              eyebrow="Qualität"
              title="Letzte 7 Sicherungstage"
              count={`${healthyDays} von 7 ohne Auffälligkeit`}
            />
            <div className="mt-3 grid grid-cols-7 gap-2">
              {trend.map((t) => (
                <TrendDay
                  key={t.date}
                  day={t}
                  total={jobs.length}
                  selected={t.date === day}
                  onSelect={() =>
                    setSelected(t.date === backupDate ? null : t.date)
                  }
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-3 text-[11px] text-slate-400 dark:text-slate-500">
              <span className="mr-auto">Tag anklicken oder ←/→ zum Wechseln</span>
              <Legend color="bg-emerald-500" label="Erfolg" />
              <Legend color="bg-amber-500" label="Warnung" />
              <Legend color="bg-rose-500" label="Fehler" />
              <Legend color="bg-slate-200 dark:bg-slate-700" label="Offen" />
            </div>
          </section>

          <RecurringPanel
            items={recurringIssues}
            onOpenJob={actions.onOpenJob}
          />
        </div>
      </main>

      <JobHistoryDialog
        job={historyJob}
        onOpenChange={(v) => !v && setHistoryJob(null)}
      />
    </div>
    </Tooltip.Provider>
  );
}

function getState(
  counts: { success: number; warning: number; failed: number },
  open: number,
  conflicts: number,
) {
  if (counts.failed) {
    return {
      label: `${counts.failed} Fehler`,
      description: 'fehlgeschlagene Jobs zuerst prüfen',
      icon: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
      badge: STATUS_META.failed.badge,
    };
  }
  if (counts.warning) {
    return {
      label: `${counts.warning} ${counts.warning === 1 ? 'Warnung' : 'Warnungen'}`,
      description: 'keine Fehler, Warnungen bitte kontrollieren',
      icon: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      badge: STATUS_META.warning.badge,
    };
  }
  if (conflicts) {
    return {
      label: `${conflicts} ${conflicts === 1 ? 'Abweichung' : 'Abweichungen'}`,
      description: 'Veeam meldete etwas anderes als quittiert',
      icon: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      badge: STATUS_META.warning.badge,
    };
  }
  if (open) {
    return {
      label: `${open} offen`,
      description: 'bisher keine Auffälligkeiten',
      icon: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
      badge:
        'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30',
    };
  }
  return {
    label: 'Alles im grünen Bereich',
    description: 'vollständig geprüft',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    badge: STATUS_META.success.badge,
  };
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
  last = false,
  href,
}: {
  label: string;
  value: number | string;
  icon: typeof Activity;
  tone: 'emerald' | 'amber' | 'rose' | 'slate' | 'osk';
  last?: boolean;
  /** Makes the tile a link (e.g. into the filtered matrix). */
  href?: string;
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    slate: 'text-slate-500 dark:text-slate-400',
    osk: 'text-osk-600 dark:text-osk-300',
  };
  const cls = cn(
    'group flex items-center gap-3 px-4 py-3.5',
    !last && 'border-r border-slate-100 dark:border-slate-800',
    href && 'transition hover:bg-slate-50 dark:hover:bg-slate-800/50',
  );
  const body = (
    <>
      <Icon className={cn('h-5 w-5 shrink-0', tones[tone])} />
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-xl font-bold leading-tight text-slate-950 dark:text-white">{value}</p>
      </div>
      {href && (
        <ArrowRight className="ml-auto h-4 w-4 text-slate-300 opacity-0 transition group-hover:opacity-100 dark:text-slate-600" />
      )}
    </>
  );
  return href ? (
    <Link href={href} title={`${label} in der Matrix anzeigen`} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function SectionHeader({ eyebrow, title, count }: { eyebrow: string; title: string; count?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{eyebrow}</p>
        <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      </div>
      {count && (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{count}</span>
      )}
    </div>
  );
}

function IssuePanel({
  eyebrow,
  title,
  items,
  jobsById,
  tone,
  actions,
}: {
  eyebrow: string;
  title: string;
  items: IssueItem[];
  jobsById: Map<number, Job>;
  tone: 'failed' | 'warning';
  actions: CellActions;
}) {
  const failed = tone === 'failed';
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, 3);
  return (
    <section
      className={cn(
        'rounded-2xl bg-white p-4 shadow-soft ring-1 dark:bg-slate-900',
        failed
          ? 'ring-rose-200 dark:ring-rose-500/25'
          : 'ring-amber-200 dark:ring-amber-500/25',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'rounded-lg p-2',
              failed
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
            )}
          >
            {failed ? <CircleX className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
          </span>
          <div>
            <p
              className={cn(
                'text-[10px] font-semibold uppercase tracking-[0.18em]',
                failed
                  ? 'text-rose-500 dark:text-rose-400'
                  : 'text-amber-500 dark:text-amber-400',
              )}
            >
              {eyebrow}
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold',
            failed
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
          )}
        >
          {items.length}
        </span>
      </div>

      {items.length ? (
        <div className="mt-4 space-y-2.5">
          {shown.map((item) => (
            <AttentionRow
              key={`${item.jobId}-${item.manualStatus ? 'conflict' : 'conf'}`}
              item={item}
              job={jobsById.get(item.jobId)}
              actions={actions}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-44 flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Keine {title.toLowerCase()}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Für diesen Sicherungstag ist alles unauffällig.
          </p>
        </div>
      )}

      {items.length > 3 && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-osk-600 dark:text-osk-300"
          >
            {showAll ? 'Weniger anzeigen' : `+${items.length - 3} weitere anzeigen`}
            <ChevronDown className={cn('h-3.5 w-3.5 transition', showAll && 'rotate-180')} />
          </button>
          <Link
            href="/overview?filter=problems"
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            In der Matrix
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

function AttentionRow({
  item,
  job,
  actions,
}: {
  item: IssueItem;
  job?: Job;
  actions: CellActions;
}) {
  const failed = item.status === 'failed';
  const conflict = item.manualStatus !== undefined;
  const imported = item.by === SYNC_AUTHOR;
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      className={cn(
        'min-w-0 rounded-lg border-l-[3px] bg-slate-50 px-3 py-2 dark:bg-slate-800/55',
        failed ? 'border-rose-500' : 'border-amber-500',
        conflict && 'border-dashed',
      )}
    >
      <div className="flex items-center gap-2">
        {job && actions.canWrite ? (
          <CellPopover
            job={job}
            date={actions.date}
            confirmation={item.confirmation}
            compact
            onSave={(status, note, by) => actions.onSave(job.id, status, note, by)}
            onClear={() => actions.onClear(job.id)}
          >
            <StatusDot status={item.confirmation?.status} size="sm" />
          </CellPopover>
        ) : (
          <span className={cn('h-2 w-2 shrink-0 rounded-full', failed ? 'bg-rose-500' : 'bg-amber-500')} />
        )}
        <button
          type="button"
          onClick={() => actions.onOpenJob(item.jobId)}
          title="Verlauf anzeigen"
          className="truncate text-left text-sm font-semibold text-slate-900 hover:text-osk-700 hover:underline dark:text-white dark:hover:text-osk-300"
        >
          {job?.name ?? `Job ${item.jobId}`}
        </button>
        {conflict && (
          <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            abweichend
          </span>
        )}
      </div>
      {conflict && (
        <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          Veeam meldete {STATUS_META[item.status].label}, manuell als{' '}
          {item.manualStatus ? STATUS_META[item.manualStatus].label : '—'} quittiert
        </p>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Einklappen' : 'Ganze Meldung anzeigen'}
        className={cn(
          'mt-1 block w-full break-words text-left text-xs leading-4 text-slate-600 dark:text-slate-300',
          !expanded && 'line-clamp-1',
        )}
      >
        {item.note || 'Keine technische Detailmeldung hinterlegt.'}
      </button>
      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" />
          {formatUtcDateTime(item.at)}
        </span>
        <span className="truncate">
          {imported ? 'importiert' : item.by ? `kontrolliert von ${item.by}` : ''}
        </span>
      </div>
    </article>
  );
}

function OpenPanel({
  jobs,
  completed,
  total,
  completion,
  actions,
  onConfirmRest,
}: {
  jobs: Job[];
  completed: number;
  total: number;
  completion: number;
  actions: CellActions;
  onConfirmRest: () => Promise<void>;
}) {
  const complete = jobs.length === 0;
  const [listOpen, setListOpen] = useState(false);
  const [askRest, setAskRest] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section
      className={cn(
        'rounded-2xl p-5 shadow-soft ring-1',
        complete
          ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25'
          : 'bg-sky-50 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/25',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              'text-[10px] font-semibold uppercase tracking-[0.18em]',
              complete
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-sky-600 dark:text-sky-400',
            )}
          >
            Prüffortschritt
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
            Offene Prüfungen
          </h2>
        </div>
        <span
          className={cn(
            'rounded-xl p-2.5',
            complete
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
          )}
        >
          {complete ? <CheckCircle2 className="h-5 w-5" /> : <CircleDashed className="h-5 w-5" />}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">{jobs.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {complete ? 'Alles erledigt' : `von ${total} Jobs ausstehend`}
          </p>
        </div>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{completion} %</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80 dark:bg-slate-950/50">
        <div
          className={cn('h-full rounded-full', complete ? 'bg-emerald-500' : 'bg-sky-500')}
          style={{ width: `${completion}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        {completed} von {total} Jobs geprüft
      </p>

      {jobs.length > 0 && (
        <div className="mt-3">
          {listOpen ? (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-white/70 p-1.5 dark:bg-slate-950/40">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center gap-2 text-xs">
                  {actions.canWrite ? (
                    <CellPopover
                      job={job}
                      date={actions.date}
                      compact
                      onSave={(status, note, by) =>
                        actions.onSave(job.id, status, note, by)
                      }
                      onClear={() => actions.onClear(job.id)}
                    >
                      <StatusDot size="sm" />
                    </CellPopover>
                  ) : (
                    <StatusDot size="sm" />
                  )}
                  <button
                    type="button"
                    onClick={() => actions.onOpenJob(job.id)}
                    className="truncate text-left font-medium text-slate-700 hover:underline dark:text-slate-300"
                  >
                    {job.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {jobs.slice(0, 3).map((job) => (
                <span
                  key={job.id}
                  className="max-w-full truncate rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-slate-950/40 dark:text-slate-300"
                >
                  {job.name}
                </span>
              ))}
              {jobs.length > 3 && (
                <span className="rounded-md bg-white/80 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                  +{jobs.length - 3}
                </span>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300"
            >
              {listOpen ? 'Liste schließen' : actions.canWrite ? 'Hier prüfen' : 'Alle anzeigen'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition', listOpen && 'rotate-180')} />
            </button>
            {actions.canWrite &&
              (askRest ? (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className="text-slate-600 dark:text-slate-300">
                    {jobs.length} als Erfolg?
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onConfirmRest();
                      setBusy(false);
                      setAskRest(false);
                    }}
                    className="rounded-md bg-emerald-500 px-2 py-1 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskRest(false)}
                    className="rounded-md px-2 py-1 text-slate-500 hover:bg-white/70 dark:hover:bg-slate-900"
                  >
                    Nein
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAskRest(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Rest als OK
                </button>
              ))}
            <Link
              href="/overview?filter=open"
              className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Matrix
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function SyncPanel({
  status,
  backupDate,
  conflicts,
}: {
  status: SyncStatus | null;
  backupDate: string;
  conflicts: number;
}) {
  const current = status?.last_date === backupDate;
  return (
    <Link
      href="/sync"
      title="Sync-Protokoll öffnen"
      className="group block rounded-2xl bg-white p-4 shadow-soft ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-slate-700"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cloud className={cn('h-4 w-4', current ? 'text-emerald-500' : 'text-amber-500')} />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Veeam-Sync</span>
        </div>
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            current ? 'bg-emerald-500' : 'bg-amber-500',
          )}
        />
      </div>
      <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">
        {status?.last_at ? formatUtcDateTime(status.last_at) : 'Kein Import'}
      </p>
      <p className={cn('mt-1 text-[11px]', current ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
        {current ? 'Aktueller Sicherungstag' : 'Import noch ausstehend'}
      </p>
      {conflicts > 0 && (
        <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          {conflicts} {conflicts === 1 ? 'Meldung weicht' : 'Meldungen weichen'} von
          der Quittung ab
        </p>
      )}
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-osk-600 dark:text-osk-300">
        Protokoll
        <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}

function RecurringPanel({
  items,
  onOpenJob,
}: {
  items: RecurringIssue[];
  onOpenJob: (jobId: number) => void;
}) {
  return (
    <section className="rounded-2xl bg-white px-5 py-3 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-500 dark:text-violet-400">
            Muster
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
            Wiederkehrend
          </h2>
        </div>
        <span className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
          <Repeat2 className="h-5 w-5" />
        </span>
      </div>

      {items.length ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <button
              type="button"
              key={item.jobId}
              onClick={() => onOpenJob(item.jobId)}
              title="Verlauf anzeigen"
              className="block w-full rounded-lg bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100 dark:bg-slate-800/55 dark:hover:bg-slate-800"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {item.name}
                </p>
                <span className="shrink-0 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                  {item.total}× auffällig
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                {item.failed > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    {item.failed} Fehler
                  </span>
                )}
                {item.warning > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {item.warning} Warnungen
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex min-h-28 flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            Keine Wiederholungen
          </p>
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
            Kein Job war mehrfach auffällig.
          </p>
        </div>
      )}
    </section>
  );
}

function TrendDay({
  day,
  total,
  selected,
  onSelect,
}: {
  day: DaySummary;
  total: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const date = fromISO(day.date);
  const problemCount = day.warning + day.failed;
  const segments = [
    { value: day.success, color: 'bg-emerald-500' },
    { value: day.warning, color: 'bg-amber-500' },
    { value: day.failed, color: 'bg-rose-500' },
    { value: day.open, color: 'bg-slate-200 dark:bg-slate-700' },
  ];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={`${formatLong(date)}: ${day.success} Erfolg · ${day.warning} Warnung · ${day.failed} Fehler · ${day.open} offen`}
      className={cn(
        'min-w-0 rounded-lg px-1 pb-1 pt-1.5 text-center transition',
        selected
          ? 'bg-osk-50 ring-2 ring-osk-500 dark:bg-osk-500/10 dark:ring-osk-400'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
      )}
    >
      <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
        {DAY_FORMAT.format(date).replace('.', '')}
      </p>
      <div className="mx-auto mt-2 flex h-16 w-full max-w-[88px] flex-col-reverse overflow-hidden bg-slate-100 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">
        {segments.map((segment, index) => (
          <span
            key={index}
            className={segment.color}
            style={{ height: `${total ? (segment.value / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <p className={cn('mt-1.5 text-[10px] font-semibold', day.failed ? 'text-rose-600 dark:text-rose-400' : day.warning ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500')}>
        {problemCount || '–'}
      </p>
      <p className="text-[9px] text-slate-400 dark:text-slate-600">{DATE_FORMAT.format(date)}</p>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="h-20 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
