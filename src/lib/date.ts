import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function toISO(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function weekRange(anchor: Date): { start: Date; end: Date; days: Date[] } {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  return { start, end, days };
}

export function monthRange(anchor: Date): { start: Date; end: Date; days: Date[] } {
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  const days: Date[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return { start, end, days };
}

export function shiftWeek(anchor: Date, dir: -1 | 1): Date {
  return addDays(anchor, 7 * dir);
}
export function shiftMonth(anchor: Date, dir: -1 | 1): Date {
  return addMonths(anchor, dir);
}

export const DOW_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTH_LONG = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export function formatShort(d: Date): string {
  return format(d, 'dd.MM.');
}
export function formatLong(d: Date): string {
  return format(d, 'dd.MM.yyyy');
}

export { addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth };
