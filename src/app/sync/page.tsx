'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { formatLong, formatUtcDateTime, fromISO } from '@/lib/date';
import {
  STATUS_META,
  SYNC_OUTCOME_LABEL,
  type Status,
  type SyncOutcome,
  type SyncRun,
  type SyncRunItem,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const NOTABLE: SyncOutcome[] = ['skipped_manual', 'unknown', 'invalid'];

export default function SyncLogPage() {
  const [runs, setRuns] = useState<SyncRun[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/sync/runs?limit=90', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as SyncRun[];
        setRuns(data);
        // Open the newest run on first load so there's something to see.
        setOpenId((id) => id ?? data[0]?.id ?? null);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Sync-Protokoll
            </h1>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
              Jeder Lauf des Veeam-Syncs mit allem, was gemeldet wurde und was
              die App damit gemacht hat. Manuell quittierte Zellen überschreibt
              der Sync nie – solche Meldungen stehen hier als „übersprungen“.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={refreshing}
            aria-label="Aktualisieren"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:ring-slate-800 dark:hover:bg-slate-900 dark:hover:text-white"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </button>
        </div>

        {runs === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : runs.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft p-8 text-center text-sm text-slate-500 dark:bg-slate-900 dark:ring-slate-800 dark:text-slate-400">
            Noch keine Sync-Läufe protokolliert. Der nächste Lauf des
            Veeam-Skripts erscheint hier.
          </div>
        ) : (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft divide-y divide-slate-100 overflow-hidden dark:bg-slate-900 dark:ring-slate-800 dark:divide-slate-800">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                open={openId === run.id}
                onToggle={() =>
                  setOpenId((id) => (id === run.id ? null : run.id))
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RunRow({
  run,
  open,
  onToggle,
}: {
  run: SyncRun;
  open: boolean;
  onToggle: () => void;
}) {
  const notable = run.skipped_manual + run.unknown + run.invalid;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-slate-50 transition dark:hover:bg-slate-800/50"
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-slate-400 transition-transform',
            open && 'rotate-90',
          )}
        />
        <div className="min-w-[180px]">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            Sicherungstag {formatLong(fromISO(run.date))}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            empfangen {formatUtcDateTime(run.received_at)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Chip tone="slate">{run.received} gemeldet</Chip>
          {run.inserted > 0 && <Chip tone="emerald">{run.inserted} neu</Chip>}
          {run.updated > 0 && (
            <Chip tone="emerald">{run.updated} aktualisiert</Chip>
          )}
          {run.skipped_manual > 0 && (
            <Chip tone="amber">{run.skipped_manual} übersprungen</Chip>
          )}
          {run.unknown > 0 && <Chip tone="amber">{run.unknown} unbekannt</Chip>}
          {run.invalid > 0 && <Chip tone="rose">{run.invalid} ungültig</Chip>}
        </div>
        {notable === 0 && (
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            alles übernommen
          </span>
        )}
      </button>
      {open && <RunItems runId={run.id} hasNotable={notable > 0} />}
    </div>
  );
}

function RunItems({
  runId,
  hasNotable,
}: {
  runId: number;
  hasNotable: boolean;
}) {
  const [items, setItems] = useState<SyncRunItem[] | null>(null);
  const [onlyNotable, setOnlyNotable] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch(`/api/sync/runs/${runId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
  }, [runId]);

  if (!items) {
    return (
      <div className="px-12 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (!onlyNotable ||
        NOTABLE.includes(i.outcome) ||
        i.status !== 'success') &&
      (!q || i.job_name.toLowerCase().includes(q)),
  );

  return (
    <div className="bg-slate-50/60 px-4 pb-4 pt-2 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Job suchen…"
          className="text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-2.5 py-1.5 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyNotable}
            onChange={(e) => setOnlyNotable(e.target.checked)}
            className="accent-osk-600"
          />
          Nur Auffälligkeiten
          {hasNotable ? '' : ' (keine)'}
        </label>
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          {shown.length} von {items.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white dark:bg-slate-900 dark:ring-slate-800">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Gemeldet</th>
              <th className="px-3 py-2 font-medium">Notiz</th>
              <th className="px-3 py-2 font-medium">Ergebnis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((i, idx) => {
              const meta = STATUS_META[i.status as Status];
              const notable = NOTABLE.includes(i.outcome);
              return (
                <tr key={`${i.job_name}-${idx}`}>
                  <td className="px-3 py-1.5 font-medium text-slate-900 dark:text-slate-100">
                    {i.job_name}
                  </td>
                  <td className="px-3 py-1.5">
                    {meta ? (
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full ring-1',
                          meta.badge,
                        )}
                      >
                        {meta.label}
                      </span>
                    ) : (
                      <span className="text-xs text-rose-600 dark:text-rose-400">
                        {i.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400">
                    {i.note || '—'}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-1.5 text-xs whitespace-nowrap',
                      notable
                        ? 'text-amber-700 font-medium dark:text-amber-300'
                        : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {SYNC_OUTCOME_LABEL[i.outcome]}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400"
                >
                  Keine Einträge für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
  children: React.ReactNode;
}) {
  const cls = {
    slate:
      'bg-slate-100 text-slate-700 ring-slate-400/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40',
    emerald: STATUS_META.success.badge,
    amber: STATUS_META.warning.badge,
    rose: STATUS_META.failed.badge,
  }[tone];
  return (
    <span className={cn('px-2 py-0.5 rounded-full ring-1 font-medium', cls)}>
      {children}
    </span>
  );
}
