import { Check, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Status } from '@/lib/types';
import { STATUS_META } from '@/lib/types';

const SIZES = {
  sm: { outer: 'h-5 w-5', icon: 'h-3 w-3' },
  md: { outer: 'h-7 w-7', icon: 'h-3.5 w-3.5' },
  lg: { outer: 'h-9 w-9', icon: 'h-4 w-4' },
} as const;

export function StatusDot({
  status,
  size = 'md',
}: {
  status?: Status;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  if (!status) {
    return (
      <span
        className={cn(
          s.outer,
          'block rounded-full border border-dashed border-slate-300 bg-white transition group-hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:group-hover:border-slate-500',
        )}
      />
    );
  }
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        s.outer,
        'rounded-full flex items-center justify-center text-white shadow-sm transition group-hover:scale-110',
        meta.dot,
      )}
    >
      {status === 'success' && <Check className={s.icon} strokeWidth={3} />}
      {status === 'warning' && (
        <AlertTriangle className={s.icon} strokeWidth={2.5} />
      )}
      {status === 'failed' && <X className={s.icon} strokeWidth={3} />}
    </span>
  );
}
