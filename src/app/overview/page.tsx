'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { preload } from 'swr';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Calendar as CalIcon,
  Loader2,
  RotateCcw,
  Check,
  Search,
  X as XIcon,
} from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { CellPopover } from '@/components/CellPopover';
import { StatusDot } from '@/components/StatusDot';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UnknownJobsPanel } from '@/components/UnknownJobsPanel';
import { JobHistoryDialog } from '@/components/JobHistoryDialog';
import { useCan, useCurrentUser } from '@/components/CurrentUserContext';
import {
  errorMessage,
  fetchJson,
  notify,
  revalidateConfirmations,
  swrFetcher,
} from '@/lib/api';
import {
  withBulkSuccess,
  withDayReset,
  withDelete,
  withUpsert,
} from '@/lib/optimistic';
import {
  DOW_SHORT,
  MONTH_LONG,
  formatLong,
  formatShort,
  fromISO,
  lastBackupDateISO,
  monthRange,
  shiftMonth,
  shiftWeek,
  toISO,
  weekRange,
} from '@/lib/date';
import type {
  Confirmation,
  Job,
  OverviewPayload,
  Status,
  SyncConflict,
} from '@/lib/types';
import { STATUS_META } from '@/lib/types';
import { cn } from '@/lib/utils';

type View = 'week' | 'month';

const EMPTY: OverviewPayload = { jobs: [], confirmations: [] };
const overviewKey = (r: { start: Date; end: Date }) =>
  `/api/overview?start=${toISO(r.start)}&end=${toISO(r.end)}`;
type RowFilter = 'all' | 'problems' | 'open';

const ROW_FILTERS: { id: RowFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'problems', label: 'Probleme' },
  { id: 'open', label: 'Offen' },
];

export default function HomePage() {
  const canWrite = useCan('write');
  const { user } = useCurrentUser();
  const [view, setView] = useState<View>('week');
  // Stable initial anchor avoids Server/Client Date mismatch (Hydration #418).
  // The real "now" is set in the mount-effect below.
  const [anchor, setAnchor] = useState<Date | null>(null);
  useEffect(() => {
    setAnchor(new Date());
  }, []);
  const [resetDialog, setResetDialog] = useState<{ date: string } | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [query, setQuery] = useState('');
  const [historyJob, setHistoryJob] = useState<Job | null>(null);
  // Deep links from the briefing: /overview?filter=problems|open
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('filter');
    if (f === 'problems' || f === 'open') setRowFilter(f);
  }, []);
  // Re-render every minute so that the current backup-day highlight moves at
  // midnight even if the tab was left open overnight.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const range = useMemo(
    () => {
      if (!anchor) return null;
      return view === 'week' ? weekRange(anchor) : monthRange(anchor);
    },
    [view, anchor],
  );

  // Cached per range: switching back to a week shows it instantly while it
  // refreshes in the background. keepPreviousData avoids an empty table
  // while a not-yet-cached range loads (the table is dimmed instead).
  const {
    data: swrData,
    isLoading: loading,
    mutate,
  } = useSWR<OverviewPayload>(range ? overviewKey(range) : null, {
    keepPreviousData: true,
    refreshInterval: 60_000,
  });
  const data = swrData ?? EMPTY;
  const fetchData = useCallback(() => void mutate(), [mutate]);

  // Prefetch the neighbouring weeks/months so paging is instant.
  const preloaded = useRef(new Set<string>());
  useEffect(() => {
    if (!anchor || !swrData) return;
    const shift = view === 'week' ? shiftWeek : shiftMonth;
    const rangeOf = view === 'week' ? weekRange : monthRange;
    for (const dir of [-1, 1] as const) {
      const key = overviewKey(rangeOf(shift(anchor, dir)));
      if (preloaded.current.has(key)) continue;
      preloaded.current.add(key);
      preload(key, swrFetcher);
    }
  }, [anchor, view, swrData]);

  // Writes: show the result immediately, send the request in the background,
  // roll back + show a toast if it fails, then refresh from the server.
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
          optimisticData: (cur) => update(cur) ?? EMPTY,
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

  const backupDate = lastBackupDateISO();
  const openCountBackupDate = useMemo(
    () =>
      data.jobs.filter((j) => !confByKey.has(`${j.id}:${backupDate}`)).length,
    [data.jobs, confByKey, backupDate],
  );
  const confirmedCountBackupDate = data.jobs.length - openCountBackupDate;

  const conflictByKey = useMemo(() => {
    const map = new Map<string, SyncConflict>();
    for (const c of data.conflicts ?? []) map.set(`${c.job_id}:${c.date}`, c);
    return map;
  }, [data.conflicts]);

  // Row filter: "problems" = any warning/failure or sync conflict in the
  // visible range, "open" = any unconfirmed day up to the backup date.
  const rowStats = useMemo(() => {
    const problems = new Set<number>();
    const open = new Set<number>();
    if (!range) return { problems, open };
    const days = range.days.map(toISO);
    for (const job of data.jobs) {
      for (const iso of days) {
        const key = `${job.id}:${iso}`;
        const conf = confByKey.get(key);
        if ((conf && conf.status !== 'success') || conflictByKey.has(key)) {
          problems.add(job.id);
        }
        if (!conf && iso <= backupDate) open.add(job.id);
      }
    }
    return { problems, open };
  }, [data.jobs, range, confByKey, conflictByKey, backupDate]);

  const visibleJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.jobs.filter(
      (j) =>
        (rowFilter === 'all' ||
          (rowFilter === 'problems' ? rowStats.problems : rowStats.open).has(
            j.id,
          )) &&
        (!q || j.name.toLowerCase().includes(q)),
    );
  }, [data.jobs, rowFilter, rowStats, query]);
  const bulkButtonLabel =
    confirmedCountBackupDate > 0 ? 'Rest des Sicherungstags OK' : 'Sicherungstag alles OK';

  function upsertConfirmation(
    job_id: number,
    date: string,
    status: Status,
    note: string | null,
    confirmed_by: string | null,
  ) {
    return optimistic(
      (d) =>
        withUpsert(d, {
          job_id,
          date,
          status,
          note,
          confirmed_by: confirmed_by ?? user?.username ?? null,
        }),
      () =>
        fetchJson('/api/confirmations', {
          method: 'POST',
          json: { job_id, date, status, note, confirmed_by },
        }),
      'Speichern fehlgeschlagen',
    );
  }

  function deleteConfirmation(job_id: number, date: string) {
    return optimistic(
      (d) => withDelete(d, job_id, date),
      () =>
        fetchJson(`/api/confirmations?job_id=${job_id}&date=${date}`, {
          method: 'DELETE',
        }),
      'Zurücksetzen fehlgeschlagen',
    );
  }

  function bulkConfirmDay(date: string) {
    return optimistic(
      (d) => withBulkSuccess(d, date, user?.username ?? null),
      () =>
        fetchJson('/api/confirmations/bulk', {
          method: 'POST',
          json: { date, status: 'success', overwrite: false },
        }),
      'Quittieren fehlgeschlagen',
    );
  }

  function askResetDay(date: string) {
    const count = confirmedPerDay.get(date) || 0;
    if (count === 0) return;
    setResetDialog({ date });
  }

  function performResetDay() {
    if (!resetDialog) return;
    const date = resetDialog.date;
    void optimistic(
      (d) => withDayReset(d, date),
      () =>
        fetchJson(`/api/confirmations/bulk?date=${date}`, { method: 'DELETE' }),
      'Zurücksetzen fehlgeschlagen',
    );
  }

  const resetCount = resetDialog
    ? confirmedPerDay.get(resetDialog.date) || 0
    : 0;

  // Crosshair: toggles hl-row / hl-col classes directly on the DOM so that
  // hovering doesn't re-render the whole matrix (month view ≈ 1200 cells).
  const tableRef = useRef<HTMLTableElement>(null);
  const crosshair = useRef<{ row: string | null; col: string | null }>({
    row: null,
    col: null,
  });

  const setCrosshair = useCallback((row: string | null, col: string | null) => {
    const table = tableRef.current;
    if (!table) return;
    const cur = crosshair.current;
    if (cur.row !== row) {
      if (cur.row)
        table.querySelector(`tr[data-row="${cur.row}"]`)?.classList.remove('hl-row');
      if (row)
        table.querySelector(`tr[data-row="${row}"]`)?.classList.add('hl-row');
    }
    if (cur.col !== col) {
      if (cur.col)
        table
          .querySelectorAll(`[data-col="${cur.col}"]`)
          .forEach((el) => el.classList.remove('hl-col'));
      if (col)
        table
          .querySelectorAll(`[data-col="${col}"]`)
          .forEach((el) => el.classList.add('hl-col'));
    }
    crosshair.current = { row, col };
  }, []);

  // Rows/columns change with view, range and data: drop stale highlights.
  useEffect(() => {
    tableRef.current
      ?.querySelectorAll('.hl-row, .hl-col')
      .forEach((el) => el.classList.remove('hl-row', 'hl-col'));
    crosshair.current = { row: null, col: null };
  }, [view, range, data, visibleJobs]);

  // Events from portals (popover, tooltip) bubble through React to the table;
  // only react to things that are really inside the table DOM.
  function cellOf(target: EventTarget): HTMLElement | null {
    const el = target as HTMLElement;
    if (!tableRef.current?.contains(el)) return null;
    return el.closest<HTMLElement>('td, th');
  }

  function onMatrixMouseOver(e: React.MouseEvent<HTMLTableElement>) {
    const cell = cellOf(e.target);
    if (!cell) return;
    const row = cell.closest<HTMLElement>('tr')?.dataset.row ?? null;
    setCrosshair(row, cell.dataset.col ?? null);
  }

  // Keyboard: the crosshair follows focus, arrow keys move between cells.
  function onMatrixFocus(e: React.FocusEvent<HTMLTableElement>) {
    const cell = cellOf(e.target);
    if (!cell) return;
    const row = cell.closest<HTMLElement>('tr')?.dataset.row ?? null;
    setCrosshair(row, cell.dataset.col ?? null);
  }

  function onMatrixKeyDown(e: React.KeyboardEvent<HTMLTableElement>) {
    const delta = (
      {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      } as Record<string, [number, number]>
    )[e.key];
    if (!delta) return;
    const cell = cellOf(e.target);
    const tr = cell?.closest<HTMLElement>('tr[data-row]');
    if (!cell || !tr) return;
    e.preventDefault();
    const rows = Array.from(
      tableRef.current!.querySelectorAll<HTMLElement>('tbody tr[data-row]'),
    );
    // Column 0 is the job name, so arrow-left from the first day lands there.
    const cols = Array.from(tr.querySelectorAll<HTMLElement>('td'));
    let r = rows.indexOf(tr);
    let c = cols.indexOf(cell);
    // Skip cells without anything focusable (e.g. empty read-only cells).
    for (;;) {
      r += delta[0];
      c += delta[1];
      if (r < 0 || r >= rows.length || c < 0 || c >= cols.length) return;
      const target = rows[r]
        .querySelectorAll<HTMLElement>('td')
        [c]?.querySelector<HTMLElement>('button');
      if (target) {
        target.focus();
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
    }
  }

  // Hydration-safe gate: server and pre-mount client render the same
  // skeleton (no Date-derived markup) until anchor is set in the mount
  // effect. Avoids React #418 which used to client-rerender <html> and
  // strip the .dark class set by the inline theme script.
  if (!range) {
    return (
      <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
        <div className="min-h-screen">
          <NavBar />
        </div>
      </Tooltip.Provider>
    );
  }

  const headerDate =
    view === 'week'
      ? `${formatShort(range.start)} – ${formatLong(range.end)}`
      : `${MONTH_LONG[range.start.getMonth()]} ${range.start.getFullYear()}`;

  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
      {/* From lg up the page itself never scrolls: header, toolbar, filters
          and legend stay put, only the job table scrolls. */}
      <div className="min-h-screen lg:h-dvh lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
        <NavBar
          badge={openCountBackupDate}
          badgeDate={formatLong(fromISO(backupDate))}
        />
        <main className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 py-6 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
          {/* toolbar */}
          <div className="shrink-0 flex flex-wrap items-center gap-3 mb-5">
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
                    view === 'week' ? shiftWeek(anchor!, -1) : shiftMonth(anchor!, -1),
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
                    view === 'week' ? shiftWeek(anchor!, 1) : shiftMonth(anchor!, 1),
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


            {canWrite && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => askResetDay(backupDate)}
                  disabled={confirmedCountBackupDate === 0}
                  title={`Alle Quittungen für den Sicherungstag ${formatLong(fromISO(backupDate))} löschen`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                    confirmedCountBackupDate === 0
                      ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                      : 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
                  )}
                >
                  <RotateCcw className="h-4 w-4" />
                  Sicherungstag zurücksetzen
                  {confirmedCountBackupDate > 0 && (
                    <span className="ml-1 text-xs text-rose-500/80 dark:text-rose-400/80">
                      ({confirmedCountBackupDate})
                    </span>
                  )}
                </button>
                <button
                  onClick={() => bulkConfirmDay(backupDate)}
                  disabled={openCountBackupDate === 0}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-soft transition',
                    openCountBackupDate === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white',
                  )}
                >
                  <CheckCheck className="h-4 w-4" />
                  {bulkButtonLabel}
                  {openCountBackupDate > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-white/20 text-white text-xs">
                      {openCountBackupDate}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          <UnknownJobsPanel
            onChanged={fetchData}
            className="mb-5 shrink-0 lg:max-h-48 lg:overflow-y-auto"
          />

          {/* row filter + search */}
          <div className="shrink-0 flex flex-wrap items-center gap-3 mb-3">
            <div className="inline-flex rounded-xl bg-white ring-1 ring-slate-200 shadow-soft p-0.5 dark:bg-slate-900 dark:ring-slate-800">
              {ROW_FILTERS.map((f) => {
                const n =
                  f.id === 'all'
                    ? data.jobs.length
                    : f.id === 'problems'
                      ? rowStats.problems.size
                      : rowStats.open.size;
                return (
                  <button
                    key={f.id}
                    onClick={() => setRowFilter(f.id)}
                    aria-pressed={rowFilter === f.id}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition',
                      rowFilter === f.id
                        ? 'bg-osk-50 text-osk-700 dark:bg-osk-500/15 dark:text-osk-300'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        'min-w-5 rounded-full px-1.5 text-xs',
                        f.id === 'problems' && n > 0
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                          : f.id === 'open' && n > 0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                      )}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                placeholder="Job suchen…"
                aria-label="Job suchen"
                className="w-56 text-sm rounded-xl ring-1 ring-slate-200 shadow-soft focus:ring-2 focus:ring-osk-500 focus:outline-none pl-8 pr-8 py-1.5 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-900 dark:ring-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Suche leeren"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {visibleJobs.length !== data.jobs.length && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {visibleJobs.length} von {data.jobs.length} Jobs
              </span>
            )}
            <span className="ml-auto hidden lg:inline text-xs text-slate-400 dark:text-slate-500">
              Jobname anklicken = Verlauf · Pfeiltasten wandern durch die Zellen
              {canWrite ? ' · Enter öffnet, 1/2/3 wählt den Status' : ''}
            </span>
          </div>

          {/* matrix */}
          {/* Card is as tall as its rows but shrinks to the space left (lg+);
              the inner area scrolls and keeps the day header sticky. */}
          <div
            aria-busy={loading}
            className={cn(
              'rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft overflow-hidden transition-opacity duration-150 dark:bg-slate-900 dark:ring-slate-800 lg:min-h-0 lg:flex lg:flex-col',
              loading && swrData && 'opacity-60',
            )}
          >
            <div className="scroll-container overflow-auto max-h-[calc(100dvh-6.5rem)] lg:max-h-none lg:min-h-0">
              <table
                ref={tableRef}
                onMouseOver={onMatrixMouseOver}
                onFocus={onMatrixFocus}
                onKeyDown={onMatrixKeyDown}
                onMouseLeave={() => setCrosshair(null, null)}
                className={cn(
                  'matrix w-full text-sm border-separate border-spacing-0',
                  view === 'month' && 'table-fixed',
                )}
              >
                <colgroup>
                  <col className={view === 'week' ? 'w-[260px]' : 'w-[190px]'} />
                  {range.days.map((d) => (
                    <col key={toISO(d)} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th
                      className={cn(
                        'sticky left-0 top-0 z-30 bg-white border-b border-slate-200 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400',
                        view === 'week'
                          ? 'min-w-[260px] px-4'
                          : 'w-[190px] max-w-[190px] px-3',
                      )}
                    >
                      Job
                    </th>
                    {range.days.map((d) => {
                      const iso = toISO(d);
                      const isBackupDate = iso === backupDate;
                      const dow = (d.getDay() + 6) % 7;
                      const isWeekend = dow >= 5;
                      const confirmed = confirmedPerDay.get(iso) || 0;
                      const open = data.jobs.length - confirmed;
                      return (
                        <th
                          key={iso}
                          data-col={iso}
                          className={cn(
                            // Sticky header needs an opaque background; the
                            // day tint sits on the inner div on top of it.
                            'sticky top-0 z-20 p-0 bg-white border-b border-slate-200 text-center font-medium align-top dark:bg-slate-900 dark:border-slate-800',
                            view === 'week' ? 'min-w-[78px]' : 'min-w-0',
                          )}
                        >
                          <div
                            className={cn(
                              'flex flex-col items-center h-full',
                              view === 'week' ? 'px-1 py-1.5' : 'px-0 py-1',
                              isBackupDate
                                ? 'bg-osk-50/60 dark:bg-osk-500/15'
                                : isWeekend
                                  ? 'bg-slate-50/50 dark:bg-slate-800/30'
                                  : '',
                            )}
                          >
                            <div
                              className={cn(
                                view === 'week'
                                  ? 'text-[10px] uppercase tracking-wider opacity-70'
                                  : 'text-[8px] uppercase leading-none opacity-60',
                                isBackupDate
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
                                view === 'week'
                                  ? 'text-base font-semibold leading-tight'
                                  : 'mt-0.5 text-xs font-semibold leading-none',
                                isBackupDate
                                  ? 'text-osk-700 dark:text-osk-300'
                                  : isWeekend
                                    ? 'text-slate-400 dark:text-slate-500'
                                    : 'text-slate-700 dark:text-slate-300',
                              )}
                            >
                              {d.getDate()}
                            </div>
                            {canWrite && view === 'week' && (
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
                  {visibleJobs.map((job) => (
                    <tr key={job.id} data-row={job.id}>
                      <td
                        className={cn(
                          'sticky left-0 z-10 bg-white border-b border-slate-100 dark:bg-slate-900 dark:border-slate-800',
                          view === 'week'
                            ? 'min-w-[260px] px-4 py-2'
                            : 'w-[190px] max-w-[190px] px-3 py-1',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setHistoryJob(job)}
                          title={`Verlauf von ${job.name} anzeigen`}
                          className={cn(
                            'block max-w-full text-left font-medium text-slate-900 truncate rounded hover:text-osk-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-osk-500 dark:text-slate-100 dark:hover:text-osk-300',
                            view === 'month' && 'text-xs',
                          )}
                        >
                          {job.name}
                        </button>
                        {view === 'week' && (
                          <div className="text-xs text-slate-400 truncate dark:text-slate-500">
                            {job.type}
                          </div>
                        )}
                      </td>
                      {range.days.map((d) => {
                        const iso = toISO(d);
                        const conf = confByKey.get(`${job.id}:${iso}`);
                        const conflict = conflictByKey.get(`${job.id}:${iso}`);
                        const isBackupDate = iso === backupDate;
                        const dow = (d.getDay() + 6) % 7;
                        const isWeekend = dow >= 5;
                        return (
                          <td
                            key={iso}
                            data-col={iso}
                            className={cn(
                              'border-b border-slate-100 text-center p-0 dark:border-slate-800',
                              isBackupDate
                                ? 'bg-osk-50/40 dark:bg-osk-500/10'
                                : isWeekend
                                  ? 'bg-slate-50/30 dark:bg-slate-800/20'
                                  : '',
                            )}
                          >
                            <div
                              className={cn(
                                'relative flex items-center justify-center',
                                view === 'week' ? 'h-11' : 'h-7',
                              )}
                            >
                              {conflict && (
                                <span
                                  aria-label={`Veeam meldete ${STATUS_META[conflict.status].label}`}
                                  title={`Veeam meldete: ${STATUS_META[conflict.status].label}${conflict.note ? ` – ${conflict.note}` : ''} (übersprungen, manuell quittiert)`}
                                  className={cn(
                                    'absolute z-[1] rounded-full ring-2 ring-white dark:ring-slate-900',
                                    STATUS_META[conflict.status].dot,
                                    view === 'week'
                                      ? 'top-1 right-[calc(50%-20px)] h-2.5 w-2.5'
                                      : 'top-0.5 right-0.5 h-1.5 w-1.5',
                                  )}
                                />
                              )}
                              {canWrite ? (
                                <CellPopover
                                  job={job}
                                  date={iso}
                                  confirmation={conf}
                                  compact={view === 'month'}
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
                  {loading && !swrData &&
                    Array.from({ length: 10 }, (_, i) => (
                      <tr key={`sk-${i}`} aria-hidden>
                        <td className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                          <div className="h-3.5 w-40 rounded bg-slate-200 animate-pulse dark:bg-slate-800" />
                        </td>
                        {range.days.map((d) => (
                          <td
                            key={toISO(d)}
                            className="border-b border-slate-100 dark:border-slate-800"
                          >
                            <div
                              className={cn(
                                'mx-auto rounded-full bg-slate-100 animate-pulse dark:bg-slate-800',
                                view === 'week' ? 'h-7 w-7' : 'h-4 w-4',
                              )}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  {data.jobs.length > 0 && visibleJobs.length === 0 && (
                    <tr>
                      <td
                        colSpan={range.days.length + 1}
                        className="p-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        Keine Jobs für diesen Filter.{' '}
                        <button
                          onClick={() => {
                            setRowFilter('all');
                            setQuery('');
                          }}
                          className="text-osk-600 underline dark:text-osk-300"
                        >
                          Alle anzeigen
                        </button>
                      </td>
                    </tr>
                  )}
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
          <div className="shrink-0 mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
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
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
              Veeam meldete etwas anderes (Zelle öffnen für Details)
            </span>
            <span className="ml-auto text-slate-400 dark:text-slate-500">
              {view === 'week'
                ? '✓ im Spalten-Kopf = alle offenen als Erfolg · ↺ = alle Quittungen des Tages löschen'
                : 'Kompakte Monats-Heatmap · Tagesaktionen stehen in der Wochenansicht bereit'}
            </span>
          </div>
        </main>

        <JobHistoryDialog
          job={historyJob}
          onOpenChange={(v) => !v && setHistoryJob(null)}
        />

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
          className={cn(
            'group inline-flex items-center justify-center rounded-full cursor-default',
            size === 'sm' ? 'h-6 w-6' : 'h-9 w-9',
          )}
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
