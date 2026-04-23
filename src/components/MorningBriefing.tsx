'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Sun,
  Check,
  AlertTriangle,
  XCircle,
  Loader2,
  RotateCcw,
  Cloud,
  CloudOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_META, type Status } from '@/lib/types';

interface Problem {
  job_id: number;
  job: string;
  status: Status;
  note: string | null;
  confirmed_by: string | null;
}

interface Briefing {
  date: string;
  total: number;
  counts: { success: number; warning: number; failed: number; open: number };
  problems: Problem[];
  lastSync: string | null;
  syncedToday: number;
  acked: boolean;
  ackedAt: string | null;
}

function parseUtc(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z');
}

function formatTime(d: Date): string {
  return d.toLocaleString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function relativeAge(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tg.`;
}

export function MorningBriefing({
  onDataChanged,
}: {
  onDataChanged?: () => void;
}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/briefing/today', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as Briefing;
        setBriefing(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function ack() {
    if (!briefing) return;
    setAcking(true);
    await fetch('/api/briefing/ack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: briefing.date }),
    });
    await load();
    setAcking(false);
    onDataChanged?.();
  }

  async function unack() {
    if (!briefing) return;
    setAcking(true);
    await fetch(`/api/briefing/ack?date=${briefing.date}`, {
      method: 'DELETE',
    });
    await load();
    setAcking(false);
  }

  if (loading || !briefing) {
    return null;
  }

  const { counts, problems, lastSync, syncedToday, acked, ackedAt, date } =
    briefing;
  const hasIssues = counts.failed + counts.warning > 0;
  const allOk = counts.failed === 0 && counts.warning === 0 && counts.open === 0;

  // Compact (acknowledged) state
  if (acked) {
    const ackDate = ackedAt ? parseUtc(ackedAt) : null;
    return (
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20 px-4 py-2.5 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30">
        <Check className="h-4 w-4 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-medium">Briefing heute gesehen</span>
          {ackDate && (
            <span className="ml-1 opacity-70">um {formatTime(ackDate)}</span>
          )}
          <span className="ml-2 text-xs opacity-80">
            ·{' '}
            {allOk
              ? 'alles ok'
              : `${counts.failed + counts.warning} Auffälligkeit${counts.failed + counts.warning === 1 ? '' : 'en'}`}
          </span>
        </div>
        <button
          onClick={unack}
          disabled={acking}
          className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-100 rounded px-2 py-1 transition dark:text-emerald-400 dark:hover:bg-emerald-500/10"
        >
          <RotateCcw className="h-3 w-3" />
          Erneut anzeigen
        </button>
      </div>
    );
  }

  // Full briefing card
  return (
    <div className="mb-5 rounded-2xl ring-1 shadow-soft overflow-hidden bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      {/* Header */}
      <div
        className={cn(
          'px-5 py-3 flex items-center gap-3 border-b',
          hasIssues
            ? 'bg-amber-50 border-amber-600/20 dark:bg-amber-500/10 dark:border-amber-400/30'
            : 'bg-osk-50 border-osk-600/20 dark:bg-osk-500/10 dark:border-osk-400/30',
        )}
      >
        <div
          className={cn(
            'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
            hasIssues
              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
              : 'bg-osk-600/10 text-osk-700 dark:text-osk-300',
          )}
        >
          <Sun className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
            Morgen-Briefing
          </div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            {formatDateLong(date)}
          </div>
        </div>
        {lastSync ? (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 flex-shrink-0">
            <Cloud className="h-3.5 w-3.5" />
            <span>Sync {relativeAge(parseUtc(lastSync))}</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">
            <CloudOff className="h-3.5 w-3.5" />
            <span>Noch kein Sync heute</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Summary bar */}
        <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
          <SummaryPill
            icon={<Check className="h-3.5 w-3.5" strokeWidth={3} />}
            label="Erfolge"
            value={counts.success}
            tone="success"
          />
          <SummaryPill
            icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />}
            label="Warnungen"
            value={counts.warning}
            tone="warning"
            highlight={counts.warning > 0}
          />
          <SummaryPill
            icon={<XCircle className="h-3.5 w-3.5" strokeWidth={2.5} />}
            label="Fehler"
            value={counts.failed}
            tone="failed"
            highlight={counts.failed > 0}
          />
          <SummaryPill
            icon={<span className="block h-2 w-2 rounded-full border border-dashed border-slate-400" />}
            label="Offen"
            value={counts.open}
            tone="slate"
            highlight={counts.open > 0}
          />
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
            von {briefing.total} Jobs ·{' '}
            {syncedToday > 0 ? `${syncedToday} via Sync` : 'kein Sync heute'}
          </span>
        </div>

        {/* Problem list */}
        {problems.length > 0 && (
          <div className="mt-3 space-y-2">
            {problems.slice(0, 6).map((p) => (
              <div
                key={p.job_id}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg px-3 py-2 ring-1',
                  p.status === 'failed'
                    ? 'bg-rose-50/60 ring-rose-600/20 dark:bg-rose-500/10 dark:ring-rose-400/30'
                    : 'bg-amber-50/60 ring-amber-600/20 dark:bg-amber-500/10 dark:ring-amber-400/30',
                )}
              >
                <span
                  className={cn(
                    'mt-1 h-2 w-2 rounded-full flex-shrink-0',
                    STATUS_META[p.status].dot,
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {p.job}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ring-1',
                        STATUS_META[p.status].badge,
                      )}
                    >
                      {STATUS_META[p.status].label}
                    </span>
                  </div>
                  {p.note && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                      {p.note}
                    </div>
                  )}
                  {p.confirmed_by && (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      via {p.confirmed_by}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {problems.length > 6 && (
              <div className="text-xs text-slate-400 dark:text-slate-500 px-3">
                … {problems.length - 6} weitere Auffälligkeiten sichtbar in der
                Matrix
              </div>
            )}
          </div>
        )}

        {problems.length === 0 && allOk && (
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Alle {briefing.total} Jobs heute erfolgreich. Keine Auffälligkeiten.
          </div>
        )}

        {problems.length === 0 && !allOk && counts.open > 0 && (
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Noch keine Fehler gemeldet — {counts.open} Jobs warten noch auf
            Quittung (evtl. hat der Sync noch nicht gelaufen).
          </div>
        )}

        {/* Ack button */}
        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={ack}
            disabled={acking}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-soft transition',
              acking
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white',
            )}
          >
            {acking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Kenntnis genommen
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryPill({
  icon,
  label,
  value,
  tone,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'failed' | 'slate';
  highlight?: boolean;
}) {
  const toneClass = {
    success: 'text-emerald-700 dark:text-emerald-300',
    warning: 'text-amber-700 dark:text-amber-300',
    failed: 'text-rose-700 dark:text-rose-300',
    slate: 'text-slate-600 dark:text-slate-400',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm',
        toneClass,
        highlight && 'font-semibold',
      )}
    >
      {icon}
      <span>
        <span className="tabular-nums">{value}</span>{' '}
        <span className="text-xs opacity-80">{label}</span>
      </span>
    </span>
  );
}
