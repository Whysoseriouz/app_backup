'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import * as Dialog from '@radix-ui/react-dialog';
import { History, Loader2, X } from 'lucide-react';
import {
  DOW_SHORT,
  addDays,
  formatLong,
  formatUtcDateTime,
  fromISO,
  lastBackupDateISO,
  startOfWeek,
  toISO,
} from '@/lib/date';
import {
  STATUS_META,
  SYNC_AUTHOR,
  type Confirmation,
  type Job,
  type Status,
  type SyncConflict,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const DAYS = 60;

/** Last 60 backup days of one job: calendar heatmap + list of issues. */
export function JobHistoryDialog({
  job,
  onOpenChange,
}: {
  job: Job | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: history, error } = useSWR<{
    confirmations: Confirmation[];
    conflicts?: SyncConflict[];
  }>(job ? `/api/jobs/${job.id}/history?days=${DAYS}` : null);
  const items = history?.confirmations ?? (error ? [] : null);
  const conflicts = useMemo(() => history?.conflicts ?? [], [history]);

  const view = useMemo(() => {
    if (!items) return null;
    const byDate = new Map(items.map((c) => [c.date, c]));
    const conflictByDate = new Map(conflicts.map((c) => [c.date, c]));
    const end = fromISO(lastBackupDateISO());
    const first = addDays(end, -(DAYS - 1));
    // Pad to full Monday-based weeks so the grid lines up with weekdays.
    const gridStart = startOfWeek(first, { weekStartsOn: 1 });
    const cells: {
      iso: string;
      inRange: boolean;
      conf?: Confirmation;
      conflict?: SyncConflict;
    }[] = [];
    for (let d = gridStart; d <= end; d = addDays(d, 1)) {
      const iso = toISO(d);
      cells.push({
        iso,
        inRange: d >= first,
        conf: byDate.get(iso),
        conflict: conflictByDate.get(iso),
      });
    }
    const counts = { success: 0, warning: 0, failed: 0, open: 0 };
    for (const c of cells) {
      if (!c.inRange) continue;
      if (c.conf) counts[c.conf.status]++;
      else counts.open++;
    }
    // Also list manually confirmed days where Veeam reported something else.
    const issues = items
      .filter((c) => c.status !== 'success' || conflictByDate.has(c.date))
      .map((c) => ({ ...c, conflict: conflictByDate.get(c.date) }));
    return { cells, counts, issues };
  }, [items, conflicts]);

  return (
    <Dialog.Root open={job !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm animate-overlay-in dark:bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(94vw,560px)] max-h-[88dvh] overflow-y-auto rounded-2xl bg-white ring-1 ring-slate-200 shadow-pop p-5 animate-dialog-in focus:outline-none dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 bg-osk-50 text-osk-600 dark:bg-osk-500/15 dark:text-osk-300">
              <History className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <Dialog.Title className="text-base font-semibold text-slate-900 truncate dark:text-slate-100">
                {job?.name}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400">
                {job?.type} · letzte {DAYS} Sicherungstage
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 -m-1 rounded"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {!view ? (
            <Loader2 className="mt-6 h-5 w-5 animate-spin text-slate-400" />
          ) : (
            <>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {(['success', 'warning', 'failed'] as Status[]).map((s) => (
                  <div
                    key={s}
                    className={cn('rounded-lg py-2 ring-1', STATUS_META[s].badge)}
                  >
                    <div className="text-lg font-semibold leading-tight">
                      {view.counts[s]}
                    </div>
                    <div className="text-[11px]">{STATUS_META[s].label}</div>
                  </div>
                ))}
                <div className="rounded-lg py-2 ring-1 bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700">
                  <div className="text-lg font-semibold leading-tight">
                    {view.counts.open}
                  </div>
                  <div className="text-[11px]">Offen</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-slate-400 dark:text-slate-500 mb-1">
                  {DOW_SHORT.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {view.cells.map((c) => (
                    <div
                      key={c.iso}
                      title={
                        c.inRange
                          ? `${formatLong(fromISO(c.iso))}: ${
                              c.conf ? STATUS_META[c.conf.status].label : 'offen'
                            }${c.conf?.note ? ` – ${c.conf.note}` : ''}${
                              c.conflict
                                ? ` · Veeam meldete ${STATUS_META[c.conflict.status].label}`
                                : ''
                            }`
                          : undefined
                      }
                      className={cn(
                        'h-5 rounded',
                        c.conflict &&
                          'ring-2 ring-offset-1 ring-rose-500 dark:ring-offset-slate-900',
                        !c.inRange
                          ? 'opacity-0'
                          : c.conf
                            ? STATUS_META[c.conf.status].dot
                            : 'border border-dashed border-slate-300 dark:border-slate-600',
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Auffälligkeiten ({view.issues.length})
                </div>
                {view.issues.length === 0 ? (
                  <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Keine Warnungen oder Fehler im Zeitraum.
                  </div>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                    {view.issues.map((c) => (
                      <li key={c.date} className="py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {formatLong(fromISO(c.date))}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full ring-1',
                              STATUS_META[c.status].badge,
                            )}
                          >
                            {STATUS_META[c.status].label}
                          </span>
                          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
                            {c.confirmed_by === SYNC_AUTHOR ? 'importiert' : c.confirmed_by || '—'}
                            {' · '}
                            {formatUtcDateTime(c.confirmed_at)}
                          </span>
                        </div>
                        {c.note && (
                          <div className="mt-0.5 text-xs text-slate-600 whitespace-pre-wrap dark:text-slate-400">
                            {c.note}
                          </div>
                        )}
                        {c.conflict && (
                          <div className="mt-1 text-xs rounded-md px-2 py-1 bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
                            Veeam meldete{' '}
                            <strong>{STATUS_META[c.conflict.status].label}</strong>
                            {c.conflict.note ? ` – ${c.conflict.note}` : ''} · nicht
                            übernommen, weil manuell quittiert
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
