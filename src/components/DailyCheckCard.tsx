'use client';

import { useState } from 'react';
import { BadgeCheck, ClipboardCheck, Loader2, Undo2 } from 'lucide-react';
import { useCurrentUser } from './CurrentUserContext';
import {
  errorMessage,
  fetchJson,
  notify,
  revalidateConfirmations,
} from '@/lib/api';
import { formatLong, formatUtcDateTime, fromISO } from '@/lib/date';
import type { DailyCheck } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * "Ich habe die Backups dieses Sicherungstags kontrolliert" – the daily
 * sign-off shown at the top of the briefing.
 */
export function DailyCheckCard({
  date,
  check,
  counts,
}: {
  date: string;
  check?: DailyCheck;
  /** Current state of the day, shown as a hint before signing off. */
  counts: { failed: number; warning: number; open: number; total: number };
}) {
  const { user } = useCurrentUser();
  const canWrite = user?.role === 'admin' || user?.role === 'write';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [askUndo, setAskUndo] = useState(false);
  const day = formatLong(fromISO(date));

  async function confirm() {
    setBusy(true);
    try {
      await fetchJson('/api/daily-checks', {
        method: 'POST',
        json: { date, note: note.trim() || null },
      });
      setNote('');
      await revalidateConfirmations();
    } catch (e) {
      notify(`Kontrolle konnte nicht gespeichert werden: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    try {
      await fetchJson(`/api/daily-checks?date=${date}`, { method: 'DELETE' });
      setAskUndo(false);
      await revalidateConfirmations();
    } catch (e) {
      notify(`Zurücknehmen fehlgeschlagen: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (check) {
    const mayUndo =
      user?.role === 'admin' ||
      (canWrite && user?.username.toLowerCase() === check.checked_by.toLowerCase());
    const snapshot = [
      check.failed_count && `${check.failed_count} Fehler`,
      check.warning_count &&
        `${check.warning_count} ${check.warning_count === 1 ? 'Warnung' : 'Warnungen'}`,
      check.open_count && `${check.open_count} offen`,
    ].filter(Boolean);
    return (
      <section className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-emerald-50 px-5 py-3 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25">
        <BadgeCheck className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Kontrolle für den {day} bestätigt
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
            von <strong>{check.checked_by}</strong> am {formatUtcDateTime(check.checked_at)}
            {' · '}
            Stand dabei:{' '}
            {snapshot.length ? snapshot.join(', ') : 'alles in Ordnung'}
          </p>
          {check.note && (
            <p className="mt-1 text-xs text-emerald-900 whitespace-pre-wrap dark:text-emerald-200">
              „{check.note}“
            </p>
          )}
        </div>
        {mayUndo &&
          (askUndo ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-emerald-900 dark:text-emerald-200">Wirklich zurücknehmen?</span>
              <button
                type="button"
                disabled={busy}
                onClick={undo}
                className="rounded-md bg-rose-500 px-2 py-1 font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                Ja
              </button>
              <button
                type="button"
                onClick={() => setAskUndo(false)}
                className="rounded-md px-2 py-1 text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Nein
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAskUndo(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-white/70 dark:text-emerald-300 dark:hover:bg-slate-900"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Zurücknehmen
            </button>
          ))}
      </section>
    );
  }

  const issues = [
    counts.failed && `${counts.failed} Fehler`,
    counts.warning &&
      `${counts.warning} ${counts.warning === 1 ? 'Warnung' : 'Warnungen'}`,
    counts.open && `${counts.open} noch offen`,
  ].filter(Boolean);

  return (
    <section className="mt-4 rounded-2xl bg-white px-5 py-3 shadow-soft ring-1 ring-osk-200 dark:bg-slate-900 dark:ring-osk-500/30">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ClipboardCheck className="h-6 w-6 shrink-0 text-osk-600 dark:text-osk-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Kontrolle für den {day} noch nicht bestätigt
          </p>
          <p
            className={cn(
              'text-xs',
              issues.length
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {issues.length
              ? `Aktuell: ${issues.join(', ')} – bitte prüfen und ggf. im Kommentar vermerken.`
              : `Alle ${counts.total} Jobs haben einen Status, keine Auffälligkeiten.`}
          </p>
        </div>
        {canWrite ? (
          <form
            className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void confirm();
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={issues.length ? 'Kommentar, z. B. Ticket-Nr.' : 'Kommentar (optional)'}
              aria-label="Kommentar zur Kontrolle"
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-osk-500 sm:w-64 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-700"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-osk-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-osk-700 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="h-4 w-4" />
              )}
              Kontrolle bestätigen
            </button>
          </form>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Bestätigen können Benutzer mit Schreibrecht.
          </span>
        )}
      </div>
    </section>
  );
}
