'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  CircleX,
  Cloud,
  Clock3,
  RefreshCw,
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
import type {
  Confirmation,
  Job,
  OverviewPayload,
  Status,
} from '@/lib/types';
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

  useEffect(() => {
    setBackupDate(lastBackupDateISO());
  }, []);

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

  const attentionItems = useMemo(
    () =>
      currentConfirmations
        .filter((item) => item.status !== 'success')
        .sort((a, b) => {
          const priority: Record<Status, number> = {
            failed: 0,
            warning: 1,
            success: 2,
          };
          return priority[a.status] - priority[b.status];
        }),
    [currentConfirmations],
  );

  const trend = useMemo<DaySummary[]>(() => {
    if (!backupDate || !data) return [];
    const end = fromISO(backupDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = toISO(addDays(end, index - 6));
      const dayItems = data.confirmations.filter((item) => item.date === date);
      const summary: DaySummary = {
        date,
        success: 0,
        warning: 0,
        failed: 0,
        open: Math.max(0, jobs.length - dayItems.length),
      };
      for (const item of dayItems) summary[item.status]++;
      return summary;
    });
  }, [backupDate, data, jobs.length]);

  const confirmed = currentConfirmations.length;
  const completion = jobs.length
    ? Math.round((confirmed / jobs.length) * 100)
    : 0;
  const briefing = getBriefing(counts, openJobs.length);

  if (!backupDate || loading || !data) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar
        badge={openJobs.length}
        badgeDate={formatLong(fromISO(backupDate))}
      />

      <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:py-9">
        <section
          className={cn(
            'relative overflow-hidden rounded-3xl border p-6 shadow-soft sm:p-8',
            briefing.panel,
          )}
        >
          <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-white/35 blur-3xl dark:bg-white/5" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className={cn('mb-3 flex items-center gap-2 text-sm font-semibold', briefing.accent)}>
                <Sunrise className="h-4 w-4" />
                Morning Briefing · Sicherungstag {formatLong(fromISO(backupDate))}
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {briefing.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                {briefing.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={load}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/10 transition hover:bg-white disabled:opacity-60 dark:bg-slate-900/70 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-900"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                Aktualisieren
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Matrix öffnen
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label="Erfolgreich"
            value={counts.success}
            detail="ohne Handlungsbedarf"
            icon={CheckCircle2}
            tone="emerald"
          />
          <SummaryCard
            label="Warnungen"
            value={counts.warning}
            detail="bitte kontrollieren"
            icon={TriangleAlert}
            tone="amber"
          />
          <SummaryCard
            label="Fehler"
            value={counts.failed}
            detail="höchste Priorität"
            icon={CircleX}
            tone="rose"
          />
          <SummaryCard
            label="Noch offen"
            value={openJobs.length}
            detail="ohne Quittierung"
            icon={CircleDashed}
            tone="slate"
          />
          <SummaryCard
            label="Vollständigkeit"
            value={`${completion} %`}
            detail={`${confirmed} von ${jobs.length} Jobs`}
            icon={Activity}
            tone="osk"
          />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.75fr)]">
          <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  Priorisierte Prüfung
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  Fehler und Warnungen
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {attentionItems.length} auffällig
              </span>
            </div>

            {attentionItems.length ? (
              <div className="mt-5 space-y-3">
                {attentionItems.map((item) => (
                  <AttentionRow
                    key={item.id}
                    confirmation={item}
                    job={jobsById.get(item.job_id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                icon={CheckCircle2}
                title="Keine Auffälligkeiten"
                description="Für diesen Sicherungstag wurden weder Fehler noch Warnungen gemeldet."
              />
            )}
          </section>

          <div className="grid gap-5">
            <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                    Noch zu erledigen
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                    Offene Prüfungen
                  </h2>
                </div>
                <CircleDashed className="h-5 w-5 text-slate-400" />
              </div>

              {openJobs.length ? (
                <div className="mt-4">
                  <div className="flex flex-wrap gap-2">
                    {openJobs.slice(0, 8).map((job) => (
                      <span
                        key={job.id}
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {job.name}
                      </span>
                    ))}
                    {openJobs.length > 8 && (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        +{openJobs.length - 8} weitere
                      </span>
                    )}
                  </div>
                  <Link
                    href="/"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-osk-600 hover:text-osk-700 dark:text-osk-300 dark:hover:text-osk-200"
                  >
                    In der Matrix bearbeiten
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <EmptyPanel
                  compact
                  icon={CheckCircle2}
                  title="Alles geprüft"
                  description="Für den Sicherungstag sind keine Jobs mehr offen."
                />
              )}
            </section>

            <SyncCard status={syncStatus} backupDate={backupDate} />
          </div>
        </div>

        <section className="mt-5 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                Verlauf
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                Die letzten sieben Sicherungstage
              </h2>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
              <Legend color="bg-emerald-500" label="Erfolg" />
              <Legend color="bg-amber-500" label="Warnung" />
              <Legend color="bg-rose-500" label="Fehler" />
              <Legend color="bg-slate-200 dark:bg-slate-700" label="Offen" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {trend.map((day) => (
              <TrendDay key={day.date} day={day} total={jobs.length} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function getBriefing(
  counts: { success: number; warning: number; failed: number },
  open: number,
) {
  if (counts.failed > 0) {
    return {
      title: `${counts.failed} ${counts.failed === 1 ? 'Fehler braucht' : 'Fehler brauchen'} Aufmerksamkeit`,
      description: `${counts.warning} Warnungen und ${open} offene Prüfungen kommen zusätzlich dazu. Beginne mit den fehlgeschlagenen Jobs.`,
      panel:
        'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 dark:border-rose-500/25 dark:from-rose-950/45 dark:via-slate-900 dark:to-amber-950/25',
      accent: 'text-rose-700 dark:text-rose-300',
    };
  }
  if (counts.warning > 0) {
    return {
      title: `${counts.warning} ${counts.warning === 1 ? 'Warnung ist' : 'Warnungen sind'} zu prüfen`,
      description: `Es wurden keine Fehler gemeldet. Prüfe die Warnungen und schließe anschließend die ${open} offenen Prüfungen ab.`,
      panel:
        'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 dark:border-amber-500/25 dark:from-amber-950/40 dark:via-slate-900 dark:to-emerald-950/20',
      accent: 'text-amber-700 dark:text-amber-300',
    };
  }
  if (open > 0) {
    return {
      title: `${open} ${open === 1 ? 'Prüfung ist' : 'Prüfungen sind'} noch offen`,
      description:
        'Bisher wurden keine Fehler oder Warnungen gemeldet. Die ausstehenden Jobs müssen noch quittiert werden.',
      panel:
        'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 dark:border-sky-500/25 dark:from-sky-950/35 dark:via-slate-900 dark:to-emerald-950/20',
      accent: 'text-sky-700 dark:text-sky-300',
    };
  }
  return {
    title: 'Alle Backups sind im grünen Bereich',
    description:
      'Der Sicherungstag ist vollständig geprüft. Aktuell gibt es keine Fehler, Warnungen oder offenen Jobs.',
    panel:
      'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:border-emerald-500/25 dark:from-emerald-950/35 dark:via-slate-900 dark:to-sky-950/20',
    accent: 'text-emerald-700 dark:text-emerald-300',
  };
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Activity;
  tone: 'emerald' | 'amber' | 'rose' | 'slate' | 'osk';
}) {
  const tones = {
    emerald:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    amber:
      'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    rose: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
    slate:
      'bg-slate-100 text-slate-600 ring-slate-600/10 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/30',
    osk: 'bg-osk-50 text-osk-700 ring-osk-600/15 dark:bg-osk-500/10 dark:text-osk-300 dark:ring-osk-400/20',
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{detail}</p>
        </div>
        <span className={cn('rounded-xl p-2.5 ring-1', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function AttentionRow({
  confirmation,
  job,
}: {
  confirmation: Confirmation;
  job?: Job;
}) {
  const isFailed = confirmation.status === 'failed';
  return (
    <article
      className={cn(
        'rounded-xl border p-4',
        isFailed
          ? 'border-rose-200 bg-rose-50/60 dark:border-rose-500/25 dark:bg-rose-500/10'
          : 'border-amber-200 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/10',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 rounded-lg p-2',
            isFailed
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
          )}
        >
          {isFailed ? <CircleX className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {job?.name ?? `Job ${confirmation.job_id}`}
            </h3>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', STATUS_META[confirmation.status].badge)}>
              {STATUS_META[confirmation.status].label}
            </span>
          </div>
          {job && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{job.type}</p>
          )}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700 dark:text-slate-300">
            {confirmation.note || 'Keine technische Detailmeldung hinterlegt.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {formatUtcDateTime(confirmation.confirmed_at)}
            </span>
            {confirmation.confirmed_by && <span>von {confirmation.confirmed_by}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}

function SyncCard({ status, backupDate }: { status: SyncStatus | null; backupDate: string }) {
  const matchesDate = status?.last_date === backupDate;
  return (
    <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-soft ring-1 ring-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Datenstand
          </p>
          <h2 className="mt-1 text-xl font-bold">Veeam-Sync</h2>
        </div>
        <span
          className={cn(
            'rounded-xl p-2.5',
            matchesDate ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300',
          )}
        >
          <Cloud className="h-5 w-5" />
        </span>
      </div>

      {status?.last_at ? (
        <div className="mt-5 space-y-3 text-sm">
          <InfoLine label="Letzter Import" value={formatUtcDateTime(status.last_at)} />
          <InfoLine
            label="Sicherungstag"
            value={status.last_date ? formatLong(fromISO(status.last_date)) : '—'}
          />
          <InfoLine label="Gesamt importiert" value={String(status.total)} />
          <div
            className={cn(
              'mt-4 rounded-lg px-3 py-2 text-xs font-medium',
              matchesDate
                ? 'bg-emerald-500/15 text-emerald-200'
                : 'bg-amber-500/15 text-amber-200',
            )}
          >
            {matchesDate
              ? 'Der aktuelle Sicherungstag wurde synchronisiert.'
              : 'Der aktuelle Sicherungstag wurde noch nicht synchronisiert.'}
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-slate-300">
          Es wurde noch kein automatischer Veeam-Import registriert.
        </p>
      )}
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-100">{value}</span>
    </div>
  );
}

function TrendDay({ day, total }: { day: DaySummary; total: number }) {
  const date = fromISO(day.date);
  const segments = [
    { key: 'success', value: day.success, className: 'bg-emerald-500' },
    { key: 'warning', value: day.warning, className: 'bg-amber-500' },
    { key: 'failed', value: day.failed, className: 'bg-rose-500' },
    { key: 'open', value: day.open, className: 'bg-slate-200 dark:bg-slate-700' },
  ];
  const problemCount = day.warning + day.failed;

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {DAY_FORMAT.format(date).replace('.', '')}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{DATE_FORMAT.format(date)}</span>
      </div>
      <div className="mt-4 flex h-20 items-end gap-1 overflow-hidden rounded-lg bg-slate-50 p-1 dark:bg-slate-800/60">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={cn('min-h-0 flex-1 rounded-sm transition-all', segment.className)}
            style={{ height: `${total ? Math.max(4, (segment.value / total) * 100) : 4}%` }}
            title={`${segment.key}: ${segment.value}`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span
          className={cn(
            'font-semibold',
            day.failed
              ? 'text-rose-600 dark:text-rose-400'
              : day.warning
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {problemCount ? `${problemCount} auffällig` : 'unauffällig'}
        </span>
        <span className="text-slate-400 dark:text-slate-500">{day.open} offen</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
      {label}
    </span>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-6' : 'py-14')}>
      <span className="rounded-full bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-56 rounded-3xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-32 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
