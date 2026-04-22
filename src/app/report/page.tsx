'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import {
  DOW_SHORT,
  MONTH_LONG,
  formatLong,
  monthRange,
  shiftMonth,
  toISO,
} from '@/lib/date';
import type {
  Confirmation,
  OverviewPayload,
  Status,
} from '@/lib/types';
import { STATUS_META } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function ReportPage() {
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [data, setData] = useState<OverviewPayload>({
    jobs: [],
    confirmations: [],
  });

  const range = useMemo(() => monthRange(anchor), [anchor]);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/overview?start=${toISO(range.start)}&end=${toISO(range.end)}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      setData(await res.json());
    }
  }, [range.start, range.end]);

  useEffect(() => {
    load();
  }, [load]);

  const confByKey = useMemo(() => {
    const map = new Map<string, Confirmation>();
    for (const c of data.confirmations) map.set(`${c.job_id}:${c.date}`, c);
    return map;
  }, [data.confirmations]);

  const stats = useMemo(() => {
    const totals = { success: 0, warning: 0, failed: 0, open: 0 };
    const days = range.days.length;
    for (const j of data.jobs) {
      for (const d of range.days) {
        const c = confByKey.get(`${j.id}:${toISO(d)}`);
        if (!c) totals.open++;
        else totals[c.status]++;
      }
    }
    const cells = data.jobs.length * days;
    return { ...totals, cells };
  }, [data.jobs, range.days, confByKey]);

  const problems = useMemo(() => {
    return data.confirmations
      .filter((c) => c.status !== 'success')
      .map((c) => ({
        ...c,
        job: data.jobs.find((j) => j.id === c.job_id)?.name ?? `#${c.job_id}`,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [data.confirmations, data.jobs]);

  const monthLabel = `${MONTH_LONG[range.start.getMonth()]} ${range.start.getFullYear()}`;

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="mx-auto max-w-[1800px] px-4 sm:px-6 py-6 print-container">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-5 no-print">
          <div className="inline-flex items-center rounded-xl bg-white ring-1 ring-slate-200 shadow-soft overflow-hidden dark:bg-slate-900 dark:ring-slate-800">
            <button
              onClick={() => setAnchor(shiftMonth(anchor, -1))}
              className="p-2 hover:bg-slate-50 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-4 py-1.5 text-sm font-semibold text-slate-800 border-x border-slate-200 min-w-[160px] text-center dark:text-slate-200 dark:border-slate-800">
              {monthLabel}
            </div>
            <button
              onClick={() => setAnchor(shiftMonth(anchor, 1))}
              className="p-2 hover:bg-slate-50 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Nächster Monat"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setAnchor(new Date())}
            className="px-3 py-1.5 text-sm font-medium rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50 shadow-soft dark:bg-slate-900 dark:ring-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Aktueller Monat
          </button>

          <button
            onClick={() => window.print()}
            className="ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-soft bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <Printer className="h-4 w-4" />
            Drucken / PDF speichern
          </button>
        </div>

        {/* report paper */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft p-6 dark:bg-slate-900 dark:ring-slate-800 print:ring-0 print:shadow-none print:rounded-none print:p-0 print:bg-white">
          <div className="flex items-start gap-4 border-b border-slate-200 pb-4 mb-5 dark:border-slate-800 print:border-slate-200">
            <Image
              src="/favicon.png"
              alt="OrgaSoft Kommunal"
              width={56}
              height={56}
              className="h-14 w-14 drop-shadow-sm print:drop-shadow-none"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold dark:text-slate-400 print:text-slate-500">
                Backup-Monatsbericht
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 print:text-slate-900">
                {monthLabel}
              </h1>
              <div className="text-xs text-slate-500 mt-0.5 dark:text-slate-400 print:text-slate-500">
                {formatLong(range.start)} – {formatLong(range.end)} ·{' '}
                {data.jobs.length} Jobs · Erstellt am{' '}
                {formatLong(new Date())}
              </div>
            </div>
            <Image
              src="/logo.png"
              alt="OrgaSoft Kommunal"
              width={180}
              height={64}
              className="hidden sm:block h-14 w-auto self-center opacity-90 print:block"
            />
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <StatCard
              label="Erfolge"
              value={stats.success}
              total={stats.cells}
              color="emerald"
            />
            <StatCard
              label="Warnungen"
              value={stats.warning}
              total={stats.cells}
              color="amber"
            />
            <StatCard
              label="Fehler"
              value={stats.failed}
              total={stats.cells}
              color="rose"
            />
            <StatCard
              label="Offen"
              value={stats.open}
              total={stats.cells}
              color="slate"
            />
          </div>

          {/* matrix */}
          <div className="overflow-x-auto scroll-container">
            <table className="w-full text-[11px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white border-b border-slate-300 px-2 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide text-[10px] min-w-[200px] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 print:bg-white print:text-slate-600 print:border-slate-300">
                    Job
                  </th>
                  {range.days.map((d) => {
                    const dow = (d.getDay() + 6) % 7;
                    const isWeekend = dow >= 5;
                    return (
                      <th
                        key={toISO(d)}
                        className={cn(
                          'border-b border-slate-300 px-0.5 py-1 text-center font-medium min-w-[22px] dark:border-slate-700 print:border-slate-300',
                          isWeekend
                            ? 'bg-slate-50 text-slate-400 dark:bg-slate-800/40 dark:text-slate-500 print:bg-slate-50 print:text-slate-400'
                            : 'text-slate-600 dark:text-slate-400 print:text-slate-600',
                        )}
                      >
                        <div className="text-[8px] uppercase opacity-70">
                          {DOW_SHORT[dow]}
                        </div>
                        <div className="text-xs font-semibold">
                          {d.getDate()}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="sticky left-0 bg-white border-b border-slate-100 px-2 py-1.5 truncate max-w-[220px] dark:bg-slate-900 dark:border-slate-800 print:bg-white print:border-slate-100">
                      <div className="font-medium text-slate-900 text-[11px] truncate dark:text-slate-100 print:text-slate-900">
                        {j.name}
                      </div>
                    </td>
                    {range.days.map((d) => {
                      const c = confByKey.get(`${j.id}:${toISO(d)}`);
                      const dow = (d.getDay() + 6) % 7;
                      const isWeekend = dow >= 5;
                      return (
                        <td
                          key={toISO(d)}
                          className={cn(
                            'border-b border-slate-100 text-center p-0.5 dark:border-slate-800 print:border-slate-100',
                            isWeekend &&
                              'bg-slate-50/60 dark:bg-slate-800/30 print:bg-slate-50',
                          )}
                        >
                          <ReportCell status={c?.status} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {data.jobs.length === 0 && (
                  <tr>
                    <td
                      colSpan={range.days.length + 1}
                      className="py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      Keine aktiven Jobs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 print:text-slate-500">
            {(['success', 'warning', 'failed'] as Status[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className={cn('h-2 w-2 rounded-full', STATUS_META[s].dot)}
                />
                {STATUS_META[s].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900 print:bg-white print:border-slate-300" />
              Offen / nicht bestätigt
            </span>
          </div>

          {/* problem details */}
          {problems.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 print:border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900 mb-2 dark:text-slate-100 print:text-slate-900">
                Auffälligkeiten ({problems.length})
              </h2>
              <div className="rounded-lg ring-1 ring-slate-200 overflow-hidden dark:ring-slate-800 print:ring-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 print:bg-slate-50">
                    <tr className="text-left text-slate-500 dark:text-slate-400 print:text-slate-500">
                      <th className="px-3 py-2 font-medium">Datum</th>
                      <th className="px-3 py-2 font-medium">Job</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Notiz</th>
                      <th className="px-3 py-2 font-medium">Quittiert von</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-100">
                    {problems.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-700 dark:text-slate-300 print:text-slate-700">
                          {p.date}
                        </td>
                        <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200 print:text-slate-800">
                          {p.job}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1',
                              STATUS_META[p.status].badge,
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                STATUS_META[p.status].dot,
                              )}
                            />
                            {STATUS_META[p.status].label}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 print:text-slate-600">
                          {p.note || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 print:text-slate-500">
                          {p.confirmed_by || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* footer (print) */}
          <div className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between dark:border-slate-800 dark:text-slate-500 print:border-slate-200 print:text-slate-400">
            <span>Backup Check · {monthLabel}</span>
            <span>Seite erzeugt {formatLong(new Date())}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function ReportCell({ status }: { status?: Status }) {
  if (!status) {
    return (
      <span className="block h-4 w-4 mx-auto rounded-full border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900 print:border-slate-300 print:bg-white" />
    );
  }
  return (
    <span
      className={cn(
        'block h-4 w-4 mx-auto rounded-full',
        STATUS_META[status].dot,
      )}
    />
  );
}

function StatCard({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    slate: 'bg-slate-400',
  }[color];
  const text = {
    emerald: 'text-emerald-700 dark:text-emerald-400 print:text-emerald-700',
    amber: 'text-amber-700 dark:text-amber-400 print:text-amber-700',
    rose: 'text-rose-700 dark:text-rose-400 print:text-rose-700',
    slate: 'text-slate-700 dark:text-slate-300 print:text-slate-700',
  }[color];
  return (
    <div className="rounded-xl ring-1 ring-slate-200 p-3 bg-white dark:bg-slate-900 dark:ring-slate-800 print:bg-white print:ring-slate-200">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold dark:text-slate-400 print:text-slate-500">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className={cn('text-xl font-semibold', text)}>{value}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500 print:text-slate-400">
          / {total}
        </span>
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 print:text-slate-400">
          {pct}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800 print:bg-slate-100">
        <div className={cn('h-full', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
