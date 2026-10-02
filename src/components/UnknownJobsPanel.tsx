'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, EyeOff, Eye, Plus, Loader2 } from 'lucide-react';
import { useCan } from './CurrentUserContext';
import { formatLong, fromISO } from '@/lib/date';
import { JOB_TYPES, STATUS_META, type UnknownJob } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Payload {
  unknown: UnknownJob[];
  ignored: string[];
}

/**
 * Lists job names the Veeam sync reported but that don't exist in the
 * portal (never created or deleted), so they can be added with one click.
 */
export function UnknownJobsPanel({
  onChanged,
  showIgnored = false,
  className,
}: {
  /** Called after a job was added, e.g. to reload the matrix. */
  onChanged?: () => void;
  /** Also offer to un-ignore previously ignored names. */
  showIgnored?: boolean;
  className?: string;
}) {
  const canWrite = useCan('write');
  const [data, setData] = useState<Payload>({ unknown: [], ignored: [] });
  const [types, setTypes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ignoredOpen, setIgnoredOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/unknown-jobs', { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch {
      /* network hiccup, try again later */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  async function add(name: string) {
    setBusy(name);
    setError(null);
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, type: types[name] ?? JOB_TYPES[0] }),
    });
    setBusy(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || `${name} konnte nicht angelegt werden`);
      return;
    }
    await load();
    onChanged?.();
  }

  async function setIgnored(name: string, ignored: boolean) {
    setBusy(name);
    setError(null);
    await fetch('/api/unknown-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ignored }),
    });
    setBusy(null);
    await load();
  }

  const { unknown, ignored } = data;
  const hasIgnored = showIgnored && ignored.length > 0;
  if (unknown.length === 0 && !hasIgnored) return null;

  return (
    <div
      className={cn(
        'rounded-2xl ring-1 shadow-soft p-4',
        unknown.length > 0
          ? 'bg-amber-50/70 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30'
          : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800',
        className,
      )}
    >
      {unknown.length > 0 && (
        <>
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Veeam-Sync meldet {unknown.length}{' '}
                {unknown.length === 1 ? 'Job, der' : 'Jobs, die'} hier nicht
                angelegt {unknown.length === 1 ? 'ist' : 'sind'}
              </div>
              <div className="text-xs text-amber-800/80 mt-0.5 dark:text-amber-300/70">
                Neu in Veeam oder im Portal gelöscht. Beim Hinzufügen werden die
                bereits gemeldeten Ergebnisse übernommen.
              </div>
            </div>
          </div>

          <ul className="mt-3 divide-y divide-amber-200/70 dark:divide-amber-500/20">
            {unknown.map((u) => (
              <li
                key={u.name}
                className="flex flex-col sm:flex-row sm:items-center gap-2 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-900 truncate dark:text-slate-100">
                    {u.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        STATUS_META[u.last_status].dot,
                      )}
                      title={STATUS_META[u.last_status].label}
                    />
                    {u.count === 1
                      ? `gemeldet am ${formatLong(fromISO(u.last_date))}`
                      : `${u.count}× gemeldet, ${formatLong(fromISO(u.first_date))} – ${formatLong(fromISO(u.last_date))}`}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2">
                    <select
                      value={types[u.name] ?? JOB_TYPES[0]}
                      onChange={(e) =>
                        setTypes((t) => ({ ...t, [u.name]: e.target.value }))
                      }
                      aria-label={`Typ für ${u.name}`}
                      className="text-xs rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-2 py-1.5 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
                    >
                      {JOB_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => add(u.name)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold bg-osk-600 hover:bg-osk-700 text-white shadow-soft transition disabled:opacity-50"
                    >
                      {busy === u.name ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Hinzufügen
                    </button>
                    <button
                      onClick={() => setIgnored(u.name, true)}
                      disabled={busy !== null}
                      title="Nicht mehr anzeigen, künftige Meldungen verwerfen"
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-amber-100 transition disabled:opacity-50 dark:text-slate-300 dark:hover:bg-amber-500/15"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      Ignorieren
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {hasIgnored && (
        <div className={cn(unknown.length > 0 && 'mt-3')}>
          <button
            onClick={() => setIgnoredOpen((o) => !o)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {ignored.length} ignorierte{' '}
            {ignored.length === 1 ? 'Sync-Meldung' : 'Sync-Meldungen'}{' '}
            {ignoredOpen ? 'ausblenden' : 'anzeigen'}
          </button>
          {ignoredOpen && (
            <ul className="mt-2 space-y-1">
              {ignored.map((name) => (
                <li
                  key={name}
                  className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span className="truncate">{name}</span>
                  {canWrite && (
                    <button
                      onClick={() => setIgnored(name, false)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Nicht mehr ignorieren
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
