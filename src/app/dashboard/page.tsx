'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
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
import {
  addDays,
  formatLong,
  formatUtcDateTime,
  fromISO,
  lastBackupDateISO,
  toISO,
} from '@/lib/date';
import type { Confirmation, Job, OverviewPayload } from '@/lib/types';
import { STATUS_META } from '@/lib/types';
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
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => setBackupDate(lastBackupDateISO()), []);

  const load = useCallback(async () => {
    if (!backupDate) return;
    setRefreshing(true);
    const end = fromISO(backupDate);
    const start = addDays(end, -6);

    try {
      const [overviewResponse, syncResponse] = await Promise.all([
        fetch(`/api/overview?start=${toISO(start)}&end=${backupDate}`, {
          cache: 'no-store',
        }),
        fetch('/api/sync/status', { cache: 'no-store' }),
      ]);
      if (overviewResponse.ok) {
        setData((await overviewResponse.json()) as OverviewPayload);
      }
      if (syncResponse.ok) {
        setSyncStatus((await syncResponse.json()) as SyncStatus);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [backupDate]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const jobs = useMemo(() => data?.jobs ?? [], [data]);
  const currentConfirmations = useMemo(
    () => data?.confirmations.filter((item) => item.date === backupDate) ?? [],
    [data, backupDate],
  );
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
  const failedItems = useMemo(
    () => currentConfirmations.filter((item) => item.status === 'failed'),
    [currentConfirmations],
  );
  const warningItems = useMemo(
    () => currentConfirmations.filter((item) => item.status === 'warning'),
    [currentConfirmations],
  );
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

  if (!backupDate || loading || !data) {
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
  const state = getState(counts, openJobs.length);

  return (
    <div className="min-h-screen">
      <NavBar badge={openJobs.length} badgeDate={formatLong(fromISO(backupDate))} />

      <main className="mx-auto max-w-[1800px] px-5 py-4 sm:px-6">
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
                Sicherungstag {formatLong(fromISO(backupDate))} · {state.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Matrix
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:grid-cols-5">
          <Metric label="Erfolgreich" value={counts.success} icon={CheckCircle2} tone="emerald" />
          <Metric label="Warnungen" value={counts.warning} icon={TriangleAlert} tone="amber" />
          <Metric label="Fehler" value={counts.failed} icon={CircleX} tone="rose" />
          <Metric label="Offen" value={openJobs.length} icon={CircleDashed} tone="slate" />
          <Metric label="Vollständig" value={`${completion} %`} icon={Activity} tone="osk" last />
        </section>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(230px,0.8fr)]">
          <IssuePanel
            eyebrow="Kritisch"
            title="Fehler"
            items={failedItems}
            jobsById={jobsById}
            tone="failed"
          />
          <IssuePanel
            eyebrow="Kontrollieren"
            title="Warnungen"
            items={warningItems}
            jobsById={jobsById}
            tone="warning"
          />
          <aside className="grid gap-4">
            <OpenPanel
              jobs={openJobs}
              completed={confirmed}
              total={jobs.length}
              completion={completion}
            />
            <SyncPanel status={syncStatus} backupDate={backupDate} />
          </aside>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
          <section className="rounded-2xl bg-white px-5 py-4 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <SectionHeader
              eyebrow="Qualität"
              title="Letzte 7 Sicherungstage"
              count={`${healthyDays} von 7 ohne Auffälligkeit`}
            />
            <div className="mt-3 grid grid-cols-7 gap-3">
              {trend.map((day) => (
                <TrendDay key={day.date} day={day} total={jobs.length} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-3 text-[11px] text-slate-400 dark:text-slate-500">
              <Legend color="bg-emerald-500" label="Erfolg" />
              <Legend color="bg-amber-500" label="Warnung" />
              <Legend color="bg-rose-500" label="Fehler" />
              <Legend color="bg-slate-200 dark:bg-slate-700" label="Offen" />
            </div>
          </section>

          <RecurringPanel items={recurringIssues} />
        </div>
      </main>
    </div>
  );
}

function getState(
  counts: { success: number; warning: number; failed: number },
  open: number,
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
}: {
  label: string;
  value: number | string;
  icon: typeof Activity;
  tone: 'emerald' | 'amber' | 'rose' | 'slate' | 'osk';
  last?: boolean;
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    slate: 'text-slate-500 dark:text-slate-400',
    osk: 'text-osk-600 dark:text-osk-300',
  };
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3.5', !last && 'border-r border-slate-100 dark:border-slate-800')}>
      <Icon className={cn('h-5 w-5 shrink-0', tones[tone])} />
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-xl font-bold leading-tight text-slate-950 dark:text-white">{value}</p>
      </div>
    </div>
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
}: {
  eyebrow: string;
  title: string;
  items: Confirmation[];
  jobsById: Map<number, Job>;
  tone: 'failed' | 'warning';
}) {
  const failed = tone === 'failed';
  return (
    <section
      className={cn(
        'rounded-2xl bg-white p-5 shadow-soft ring-1 dark:bg-slate-900',
        failed
          ? 'ring-rose-200 dark:ring-rose-500/25'
          : 'ring-amber-200 dark:ring-amber-500/25',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'rounded-xl p-2.5',
              failed
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
            )}
          >
            {failed ? <CircleX className="h-5 w-5" /> : <TriangleAlert className="h-5 w-5" />}
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
          {items.slice(0, 4).map((item) => (
            <AttentionRow
              key={item.id}
              confirmation={item}
              job={jobsById.get(item.job_id)}
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

      {items.length > 4 && (
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-osk-600 dark:text-osk-300"
        >
          +{items.length - 4} weitere in der Matrix
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </section>
  );
}

function AttentionRow({ confirmation, job }: { confirmation: Confirmation; job?: Job }) {
  const failed = confirmation.status === 'failed';
  return (
    <article
      className={cn(
        'min-w-0 rounded-xl border-l-[3px] bg-slate-50 px-3.5 py-3 dark:bg-slate-800/55',
        failed ? 'border-rose-500' : 'border-amber-500',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', failed ? 'bg-rose-500' : 'bg-amber-500')} />
        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
          {job?.name ?? `Job ${confirmation.job_id}`}
        </h3>
      </div>
      <p className="mt-1 line-clamp-2 min-h-8 break-words text-xs leading-4 text-slate-600 dark:text-slate-300">
        {confirmation.note || 'Keine technische Detailmeldung hinterlegt.'}
      </p>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" />
          {formatUtcDateTime(confirmation.confirmed_at)}
        </span>
        {confirmation.confirmed_by && <span className="truncate">{confirmation.confirmed_by}</span>}
      </div>
    </article>
  );
}

function OpenPanel({
  jobs,
  completed,
  total,
  completion,
}: {
  jobs: Job[];
  completed: number;
  total: number;
  completion: number;
}) {
  const complete = jobs.length === 0;
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
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300"
          >
            Jetzt prüfen
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

function SyncPanel({ status, backupDate }: { status: SyncStatus | null; backupDate: string }) {
  const current = status?.last_date === backupDate;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
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
    </section>
  );
}

function RecurringPanel({ items }: { items: RecurringIssue[] }) {
  return (
    <section className="rounded-2xl bg-white px-5 py-4 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
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
            <div
              key={item.jobId}
              className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/55"
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
            </div>
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

function TrendDay({ day, total }: { day: DaySummary; total: number }) {
  const date = fromISO(day.date);
  const problemCount = day.warning + day.failed;
  const segments = [
    { value: day.success, color: 'bg-emerald-500' },
    { value: day.warning, color: 'bg-amber-500' },
    { value: day.failed, color: 'bg-rose-500' },
    { value: day.open, color: 'bg-slate-200 dark:bg-slate-700' },
  ];
  return (
    <div className="min-w-0 text-center">
      <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
        {DAY_FORMAT.format(date).replace('.', '')}
      </p>
      <div className="mx-auto mt-2 flex h-20 w-5 flex-col-reverse overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
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
    </div>
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
