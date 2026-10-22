'use client';

import { useState } from 'react';
import { BadgeCheck, Loader2, MessageSquare, Undo2 } from 'lucide-react';
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
 * sign-off. Compact so it fits into the briefing header (Full HD without
 * scrolling): a comment field + button, or a green badge once confirmed.
 */
export function DailyCheckControl({
  date,
  check,
  counts,
}: {
  date: string;
  check?: DailyCheck;
  /** Current state of the day, used for the hint before signing off. */
  counts: { failed: number; warning: number; open: number; total: number };
}) {
  const { user } = useCurrentUser();
  const canWrite = user?.role === 'admin' || user?.role === 'write';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [askUndo, setAskUndo] = useState(false);

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
    const [d, time] = formatUtcDateTime(check.checked_at).split(', ');
    const snapshot = [
      check.failed_count && `${check.failed_count} Fehler`,
      check.warning_count && `${check.warning_count} Warnung(en)`,
      check.open_count && `${check.open_count} offen`,
    ].filter(Boolean);
    const title =
      `Kontrolle für den ${formatLong(fromISO(date))} bestätigt von ${check.checked_by} am ${d}, ${time}` +
      ` · Stand dabei: ${snapshot.length ? snapshot.join(', ') : 'alles in Ordnung'}` +
      (check.note ? `\nKommentar: ${check.note}` : '');
    return (
      <div className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-50 pl-2.5 pr-1 text-sm ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30">
        <span
          title={title}
          className="inline-flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300"
        >
          <BadgeCheck className="h-4 w-4" />
          Kontrolliert · {check.checked_by} · {time}
          {check.note && <MessageSquare className="h-3.5 w-3.5 opacity-70" />}
        </span>
        {mayUndo &&
          (askUndo ? (
            <span className="ml-1 inline-flex items-center gap-1 text-xs">
              <button
                type="button"
                disabled={busy}
                onClick={undo}
                className="rounded-md bg-rose-500 px-2 py-1 font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                Zurücknehmen
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
              title="Kontrolle zurücknehmen"
              aria-label="Kontrolle zurücknehmen"
              className="ml-0.5 rounded-md p-1.5 text-emerald-700 hover:bg-white/70 dark:text-emerald-300 dark:hover:bg-slate-900"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          ))}
      </div>
    );
  }

  if (!canWrite) {
    return (
      <span className="inline-flex h-9 items-center rounded-lg px-3 text-xs text-slate-500 ring-1 ring-slate-200 dark:text-slate-400 dark:ring-slate-800">
        Kontrolle noch nicht bestätigt
      </span>
    );
  }

  const hasIssues = counts.failed + counts.warning + counts.open > 0;
  return (
    <form
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void confirm();
      }}
    >
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={hasIssues ? 'Kommentar, z. B. Ticket-Nr.' : 'Kommentar (optional)'}
        aria-label="Kommentar zur Kontrolle"
        className="h-9 w-56 rounded-lg px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-osk-500 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-700"
      />
      <button
        type="submit"
        disabled={busy}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-lg bg-osk-600 px-3.5 text-sm font-semibold text-white shadow-soft transition hover:bg-osk-700 disabled:opacity-60',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
        Kontrolle bestätigen
      </button>
    </form>
  );
}
