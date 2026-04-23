'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Calendar as CalIcon,
  Loader2,
  RotateCcw,
  Check,
} from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { CellPopover } from '@/components/CellPopover';
import { StatusDot } from '@/components/StatusDot';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SyncIndicator } from '@/components/SyncIndicator';
import { useCan } from '@/components/CurrentUserContext';
import {
  DOW_SHORT,
  MONTH_LONG,
  formatLong,
  formatShort,
  fromISO,
  monthRange,
  shiftMonth,
  shiftWeek,
  todayISO,
  toISO,
  weekRange,
} from '@/lib/date';
import type {
  Confirmation,
  OverviewPayload,
  Status,
} from '@/lib/types';
import { STATUS_META } from '@/lib/types';
import { cn } from '@/lib/utils';

type View = 'week' | 'month';

export default function HomePage() {
  const canWrite = useCan('write');
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [data, setData] = useState<OverviewPayload>({
    jobs: [],
    confirmations: [],
  });
  const [loading, setLoading] = useState(true);
  const [resetDialog, setResetDialog] = useState<{ date: string } | null>(null);
  // Re-render every minute so that the "heute"-highlight jumps to the new
  // column at midnight even if the tab was left open overnight.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const range = useMemo(
    () => (view === 'week' ? weekRange(anchor) : monthRange(anchor)),
    [view, anchor],
  );

  const fetchData = useCallback(async () => {
    const res = await fetch(
      `/api/overview?start=${toISO(range.start)}&end=${toISO(range.end)}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const json: OverviewPayload = await res.json();
      setData(json);
    }
    setLoading(false);
  }, [range.start, range.end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const confByKey = useMemo(() => {
    const map = new Map<string, Confirmation>();
    for (const c of data.confirmations) map.set(`${c.job_id}:${c.date}`, c);
    return map;
  }, [data.confirmations]);

  const confirmedPerDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data.confirmations) {
      m.set(c.date, (m.get(c.date) || 0) + 1);
    }
    return m;
  }, [data.confirmations]);

  const today = todayISO();
  const openCountToday = useMemo(
    () =>
      data.jobs.filter((j) => !confByKey.has(`${j.id}:${today}`)).length,
    [data.jobs, confByKey, today],
  );
  const confirmedCountToday = data.jobs.length - openCountToday;
  const bulkButtonLabel =
    confirmedCountToday > 0 ? 'Den Rest OK' : 'Heute alles OK';

  async function upsertConfirmation(
    job_id: number,
    date: string,
    status: Status,
    note: string | null,
    confirmed_by: string | null,
  ) {
    await fetch('/api/confirmations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id, date, status, note, confirmed_by }),
    });
    await fetchData();
  }

  async function deleteConfirmation(job_id: number, date: string) {
    await fetch(`/api/confirmations?job_id=${job_id}&date=${date}`, {
      method: 'DELETE',
    });
    await fetchData();
  }

  async function bulkConfirmDay(date: string) {
    const confirmed_by =
      typeof window !== 'undefined'
        ? localStorage.getItem('backup-check:by') || ''
        : '';
    await fetch('/api/confirmations/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date,
        status: 'success',
        confirmed_by,
        overwrite: false,
      }),
    });
    await fetchData();
  }

  function askResetDay(date: string) {
    const count = confirmedPerDay.get(date) || 0;
    if (count === 0) return;
    setResetDialog({ date });
  }

  async function performResetDay() {
    if (!resetDialog) return;
    await fetch(`/api/confirmations/bulk?date=${resetDialog.date}`, {
      method: 'DELETE',
    });
    await fetchData();
  }

  const headerDate =
    view === 'week'
      ? `${formatShort(range.start)} – ${formatLong(range.end)}`
      : `${MONTH_LONG[range.start.getMonth()]} ${range.start.getFullYear()}`;

  const resetCount = resetDialog
    ? confirmedPerDay.get(resetDialog.date) || 0
    : 0;

  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
      <div className="min-h-screen">
        <NavBar badge={openCountToday} />
        <main className="mx-auto max-w-[1800px] px-4 sm:px-6 py-6">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="inline-flex rounded-xl bg-white ring-1 ring-slate-200 shadow-soft p-0.5 dark:bg-slate-900 dark:ring-slate-800">
              {(['week', 'month'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-3.5 py-1.5 text-sm font-medium rounded-lg transition',
                    view === v
                      ? 'bg-osk-50 text-osk-700 dark:bg-osk-500/15 dark:text-osk-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                  )}
                >
                  {v === 'week' ? 'Woche' : 'Monat'}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center rounded-xl bg-white ring-1 ring-slate-200 shadow-soft overflow-hidden dark:bg-slate-900 dark:ring-slate-800">
              <button
                onClick={() =>
                  setAnchor(
                    view === 'week' ? shiftWeek(anchor, -1) : shiftMonth(anchor, -1),
                  )
                }
                className="p-2 hover:bg-slate-50 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Zurück"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setAnchor(new Date())}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 border-x border-slate-200 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                Heute
              </button>
              <button
                onClick={() =>
                  setAnchor(
                    view === 'week' ? shiftWeek(anchor, 1) : shiftMonth(anchor, 1),
                  )
                }
                className="p-2 hover:bg-slate-50 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Vor"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-700 font-medium dark:text-slate-300">
              <CalIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              {headerDate}
            </div>

            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />
            )}

            <SyncIndicator />

            {canWrite && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => askResetDay(today)}
                  disabled={confirmedCountToday === 0}
                  title="Alle heutigen Quittungen löschen"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                    confirmedCountToday === 0
                      ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                      : 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
                  )}
                >
                  <RotateCcw className="h-4 w-4" />
                  Heute zurücksetzen
                  {confirmedCountToday > 0 && (
                    <span className="ml-1 text-xs text-rose-500/80 dark:text-rose-400/80">
                      ({confirmedCountToday})
                    </span>
                  )}
                </button>
                <button
                  onClick={() => bulkConfirmDay(today)}
                  disabled={openCountToday === 0}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-soft transition',
                    openCountToday === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white',
                  )}
                >
                  <CheckCheck className="h-4 w-4" />
                  {bulkButtonLabel}
                  {openCountToday > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-white/20 text-white text-xs">
                      {openCountToday}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* matrix */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft overflow-hidden dark:bg-slate-900 dark:ring-slate-800">
            <div className="scroll-container overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide min-w-[260px] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
                      Job
                    </th>
                    {range.days.map((d) => {
                      const iso = toISO(d);
                      const isToday = iso === today;
                      const dow = (d.getDay() + 6) % 7;
                      const isWeekend = dow >= 5;
                      const confirmed = confirmedPerDay.get(iso) || 0;
                      const open = data.jobs.length - confirmed;
                      return (
                        <th
                          key={iso}
                          className={cn(
                            'border-b border-slate-200 px-1 py-1.5 text-center font-medium align-top dark:border-slate-800',
                            view === 'week'
                              ? 'min-w-[78px]'
                              : 'min-w-[46px]',
                            isToday
                              ? 'bg-osk-50/60 dark:bg-osk-500/15'
                              : isWeekend
                                ? 'bg-slate-50/50 dark:bg-slate-800/30'
                                : '',
                          )}
                        >
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                'text-[10px] uppercase tracking-wider opacity-70',
                                isToday
                                  ? 'text-osk-700 dark:text-osk-300'
                                  : isWeekend
                                    ? 'text-slate-400 dark:text-slate-500'
                                    : 'text-slate-500 dark:text-slate-400',
                              )}
                            >
                              {DOW_SHORT[dow]}
                            </div>
                            <div
                              className={cn(
                                'text-base font-semibold leading-tight',
                                isToday
                                  ? 'text-osk-700 dark:text-osk-300'
                                  : isWeekend
                                    ? 'text-slate-400 dark:text-slate-500'
                                    : 'text-slate-700 dark:text-slate-300',
                              )}
                            >
                              {d.getDate()}
                            </div>
                            {canWrite && (
                              <DayActions
                                view={view}
                                onConfirm={() => bulkConfirmDay(iso)}
                                onReset={() => askResetDay(iso)}
                                confirmDisabled={open === 0}
                                resetDisabled={confirmed === 0}
                                confirmTitle={
                                  open === 0
                                    ? 'Bereits alle bestätigt'
                                    : `${formatLong(d)} – alle ${open} offenen Jobs als Erfolg quittieren`
                                }
                                resetTitle={
                                  confirmed === 0
                                    ? 'Nichts zum Zurücksetzen'
                                    : `${formatLong(d)} – alle ${confirmed} Quittungen löschen`
                                }
                              />
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr key={job.id} className="group">
                      <td className="sticky left-0 z-10 bg-white border-b border-slate-100 px-4 py-2 min-w-[260px] group-hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:group-hover:bg-slate-800/60">
                        <div className="font-medium text-slate-900 truncate dark:text-slate-100">
                          {job.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate dark:text-slate-500">
                          {job.type}
                        </div>
                      </td>
                      {range.days.map((d) => {
                        const iso = toISO(d);
                        const conf = confByKey.get(`${job.id}:${iso}`);
                        const isToday = iso === today;
                        const dow = (d.getDay() + 6) % 7;
                        const isWeekend = dow >= 5;
                        return (
                          <td
                            key={iso}
                            className={cn(
                              'border-b border-slate-100 text-center p-0 dark:border-slate-800',
                              isToday
                                ? 'bg-osk-50/40 group-hover:bg-osk-100/60 dark:bg-osk-500/10 dark:group-hover:bg-osk-500/20'
                                : isWeekend
                                  ? 'bg-slate-50/30 group-hover:bg-slate-100/70 dark:bg-slate-800/20 dark:group-hover:bg-slate-800/50'
                                  : 'group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60',
                            )}
                          >
                            <div className="flex items-center justify-center h-11">
                              {canWrite ? (
                                <CellPopover
                                  job={job}
                                  date={iso}
                                  confirmation={conf}
                                  onSave={(status, note, by) =>
                                    upsertConfirmation(
                                      job.id,
                                      iso,
                                      status,
                                      note,
                                      by,
                                    )
                                  }
                                  onClear={() =>
                                    deleteConfirmation(job.id, iso)
                                  }
                                >
                                  <StatusDot
                                    status={conf?.status}
                                    size={view === 'week' ? 'md' : 'sm'}
                                  />
                                </CellPopover>
                              ) : (
                                <ReadOnlyCell
                                  confirmation={conf}
                                  size={view === 'week' ? 'md' : 'sm'}
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {data.jobs.length === 0 && !loading && (
                    <tr>
                      <td
                        colSpan={range.days.length + 1}
                        className="p-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        Noch keine Jobs.{' '}
                        <Link
                          href="/jobs"
                          className="text-osk-600 underline dark:text-osk-300"
                        >
                          Jetzt anlegen
                        </Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Legende:</span>
            {(['success', 'warning', 'failed'] as Status[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className={cn('h-2.5 w-2.5 rounded-full', STATUS_META[s].dot)}
                />
                {STATUS_META[s].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900" />
              Offen
            </span>
            <span className="ml-auto text-slate-400 dark:text-slate-500">
              ✓ im Spalten-Kopf = alle offenen als Erfolg · ↺ = alle
              Quittungen des Tages löschen
            </span>
          </div>
        </main>

        <ConfirmDialog
          open={resetDialog !== null}
          onOpenChange={(v) => !v && setResetDialog(null)}
          title="Quittungen zurücksetzen?"
          description={
            resetDialog ? (
              <>
                Alle{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {resetCount}
                </span>{' '}
                Quittungen für{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatLong(fromISO(resetDialog.date))}
                </span>{' '}
                werden gelöscht. Die Jobs erscheinen danach wieder als offen.
              </>
            ) : null
          }
          confirmLabel="Zurücksetzen"
          variant="destructive"
          icon={<RotateCcw className="h-5 w-5" strokeWidth={2} />}
          onConfirm={performResetDay}
        />
      </div>
    </Tooltip.Provider>
  );
}

function DayActions({
  view,
  onConfirm,
  onReset,
  confirmDisabled,
  resetDisabled,
  confirmTitle,
  resetTitle,
}: {
  view: View;
  onConfirm: () => void;
  onReset: () => void;
  confirmDisabled: boolean;
  resetDisabled: boolean;
  confirmTitle: string;
  resetTitle: string;
}) {
  const size =
    view === 'week' ? 'h-[22px] w-8 text-xs' : 'h-[18px] w-[22px]';
  const iconSize = view === 'week' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  const gap = view === 'week' ? 'gap-1' : 'gap-0.5';

  return (
    <div className={cn('mt-1 flex items-center justify-center', gap)}>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        title={confirmTitle}
        aria-label="Alle offenen Jobs als Erfolg"
        className={cn(
          'inline-flex items-center justify-center rounded-md ring-1 transition',
          size,
          confirmDisabled
            ? 'bg-slate-100 ring-slate-200 text-slate-300 cursor-not-allowed dark:bg-slate-800/70 dark:ring-slate-700/70 dark:text-slate-600'
            : 'bg-white ring-slate-200 text-slate-500 hover:bg-emerald-500 hover:ring-emerald-600 hover:text-white shadow-sm dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-300 dark:hover:bg-emerald-500 dark:hover:ring-emerald-500 dark:hover:text-white',
        )}
      >
        <Check className={iconSize} strokeWidth={3} />
      </button>
      <button
        onClick={onReset}
        disabled={resetDisabled}
        title={resetTitle}
        aria-label="Alle Quittungen des Tages löschen"
        className={cn(
          'inline-flex items-center justify-center rounded-md ring-1 transition',
          size,
          resetDisabled
            ? 'bg-slate-100 ring-slate-200 text-slate-300 cursor-not-allowed dark:bg-slate-800/70 dark:ring-slate-700/70 dark:text-slate-600'
            : 'bg-white ring-slate-200 text-slate-500 hover:bg-rose-500 hover:ring-rose-600 hover:text-white shadow-sm dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-300 dark:hover:bg-rose-500 dark:hover:ring-rose-500 dark:hover:text-white',
        )}
      >
        <RotateCcw className={iconSize} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function ReadOnlyCell({
  confirmation,
  size,
}: {
  confirmation?: Confirmation;
  size: 'sm' | 'md';
}) {
  if (!confirmation) {
    return <StatusDot status={undefined} size={size} />;
  }
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="group inline-flex items-center justify-center h-9 w-9 rounded-full cursor-default"
          aria-label={STATUS_META[confirmation.status].label}
        >
          <StatusDot status={confirmation.status} size={size} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          collisionPadding={10}
          className="z-40 max-w-[260px] rounded-lg bg-slate-900 text-white px-3 py-2 text-xs shadow-pop animate-fade-in dark:bg-slate-800 dark:ring-1 dark:ring-slate-700"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                STATUS_META[confirmation.status].dot,
              )}
            />
            {STATUS_META[confirmation.status].label}
          </div>
          {confirmation.note && (
            <div className="mt-1 text-slate-200 leading-snug whitespace-pre-wrap">
              {confirmation.note}
            </div>
          )}
          {confirmation.confirmed_by && (
            <div className="mt-1 text-[10px] text-slate-400">
              von {confirmation.confirmed_by}
            </div>
          )}
          <Tooltip.Arrow className="fill-slate-900 dark:fill-slate-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
