import { BadgeCheck } from 'lucide-react';
import { formatUtcDateTime } from '@/lib/date';
import type { DailyCheck } from '@/lib/types';
import { cn } from '@/lib/utils';

/** "christian.petry" -> "CP", "admin" -> "AD". */
export function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Who signed off a backup day, shown in the day header of the matrix and the
 * report. Full name + time in the week view, initials in the narrow month view.
 */
export function DayCheckBadge({
  check,
  compact,
}: {
  check: DailyCheck;
  compact: boolean;
}) {
  const [date, time] = formatUtcDateTime(check.checked_at).split(', ');
  const title = `Kontrolle bestätigt von ${check.checked_by} am ${date}, ${time}${
    check.note ? ` – ${check.note}` : ''
  }`;
  const tone =
    'text-emerald-700 dark:text-emerald-400 print:text-emerald-700';

  if (compact) {
    return (
      <span
        title={title}
        aria-label={title}
        className={cn('mt-0.5 flex flex-col items-center leading-none', tone)}
      >
        <BadgeCheck className="h-3 w-3" />
        <span className="mt-px text-[8px] font-bold tracking-tight">
          {initials(check.checked_by)}
        </span>
      </span>
    );
  }

  return (
    <span
      title={title}
      aria-label={title}
      className={cn('mt-0.5 flex flex-col items-center leading-tight', tone)}
    >
      <span className="inline-flex max-w-full items-center gap-0.5 text-[10px] font-semibold">
        <BadgeCheck className="h-3 w-3 shrink-0" />
        <span className="max-w-[72px] truncate">{check.checked_by}</span>
      </span>
      <span className="text-[9px] opacity-80">
        {date?.slice(0, 6)} {time}
      </span>
    </span>
  );
}
