'use client';

import { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Check, X, AlertTriangle, Trash2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Confirmation, Job, Status } from '@/lib/types';
import { STATUS_META } from '@/lib/types';
import { formatLong, fromISO } from '@/lib/date';
import { useCurrentUser } from './CurrentUserContext';

export function CellPopover({
  job,
  date,
  confirmation,
  onSave,
  onClear,
  children,
}: {
  job: Job;
  date: string;
  confirmation?: Confirmation;
  onSave: (
    status: Status,
    note: string | null,
    by: string | null,
  ) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'admin';
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Status>('success');
  const [note, setNote] = useState<string>('');
  const [by, setBy] = useState<string>('');
  // Suppress tooltip briefly after closing the popover so it doesn't
  // immediately pop up while the cursor is still parked on the cell.
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);
  const okBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setTooltipSuppressed(true);
      const id = setTimeout(() => setTooltipSuppressed(false), 600);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setSelected(confirmation?.status ?? 'success');
      setNote(confirmation?.note ?? '');
      // Non-admin users always quittieren in ihrem eigenen Namen; Admins
      // duerfen den bestehenden Wert uebernehmen oder frei eingeben.
      if (isAdmin) {
        setBy(confirmation?.confirmed_by ?? user?.username ?? '');
      } else {
        setBy(user?.username ?? '');
      }
    }
  }, [open, confirmation, isAdmin, user]);

  async function handleSave() {
    await onSave(selected, note.trim() || null, by.trim() || null);
    setOpen(false);
  }

  async function handleClear() {
    await onClear();
    setOpen(false);
  }

  const current = confirmation?.status;
  // Force tooltip closed when popover is open, when we just closed it, or
  // when there's no confirmation to describe. Otherwise let Radix track
  // hover state natively (undefined = uncontrolled).
  const tooltipOpenProp: boolean | undefined =
    open || tooltipSuppressed || !confirmation ? false : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Root open={tooltipOpenProp}>
        <Popover.Trigger asChild>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              className="group inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="Bestätigung"
            >
              {children}
            </button>
          </Tooltip.Trigger>
        </Popover.Trigger>
        {confirmation && (
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
                    STATUS_META[confirmation!.status].dot,
                  )}
                />
                {STATUS_META[confirmation!.status].label}
              </div>
              {confirmation!.note && (
                <div className="mt-1 text-slate-200 leading-snug whitespace-pre-wrap">
                  {confirmation!.note}
                </div>
              )}
              {confirmation!.confirmed_by && (
                <div className="mt-1 text-[10px] text-slate-400">
                  von {confirmation!.confirmed_by}
                </div>
              )}
              <Tooltip.Arrow className="fill-slate-900 dark:fill-slate-800" />
            </Tooltip.Content>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={8}
          align="center"
          collisionPadding={12}
          className="z-50 w-[340px] rounded-xl bg-white ring-1 ring-slate-200 shadow-pop p-4 animate-fade-in focus:outline-none dark:bg-slate-900 dark:ring-slate-800"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            okBtn.current?.focus();
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {formatLong(fromISO(date))}
              </div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {job.name}
              </div>
            </div>
            {current && (
              <span
                className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full ring-1 whitespace-nowrap',
                  STATUS_META[current].badge,
                )}
              >
                {STATUS_META[current].label}
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatusOption
              status="success"
              selected={selected}
              onSelect={() => setSelected('success')}
            />
            <StatusOption
              status="warning"
              selected={selected}
              onSelect={() => setSelected('warning')}
            />
            <StatusOption
              status="failed"
              selected={selected}
              onSelect={() => setSelected('failed')}
            />
          </div>

          <label className="block mt-3 text-xs font-medium text-slate-600 dark:text-slate-400">
            Notiz{' '}
            <span className="text-slate-400 dark:text-slate-500 font-normal">
              (optional)
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
            rows={2}
            className="mt-1 w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-2.5 py-1.5 resize-none bg-white text-slate-900 placeholder:text-slate-400 dark:ring-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="z. B. Veeam-Warnung, nachgeholt um 06:00. Enter speichert, Shift+Enter = neue Zeile."
          />

          <label className="block mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            Quittiert von
            {!isAdmin && (
              <span className="ml-1 text-slate-400 font-normal">
                (automatisch)
              </span>
            )}
          </label>
          <div className="relative mt-1">
            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              readOnly={!isAdmin}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className={cn(
                'w-full text-sm rounded-lg ring-1 ring-slate-200 focus:outline-none px-2.5 py-1.5 placeholder:text-slate-400 dark:ring-slate-700 dark:placeholder:text-slate-500',
                isAdmin
                  ? 'bg-white text-slate-900 focus:ring-2 focus:ring-osk-500 dark:bg-slate-950 dark:text-slate-100'
                  : 'bg-slate-50 text-slate-600 cursor-default pr-8 dark:bg-slate-800/50 dark:text-slate-400',
              )}
              placeholder="Dein Name"
              tabIndex={isAdmin ? undefined : -1}
            />
            {!isAdmin && (
              <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {confirmation && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-md dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Zurücksetzen
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              ref={okBtn}
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 text-sm font-semibold rounded-md shadow-soft focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-500 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:focus:ring-offset-slate-900"
            >
              OK
            </button>
          </div>
          <Popover.Arrow className="fill-white dark:fill-slate-900" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function StatusOption({
  status,
  selected,
  onSelect,
}: {
  status: Status;
  selected: Status;
  onSelect: () => void;
}) {
  const isSelected = status === selected;
  const Icon =
    status === 'success' ? Check : status === 'warning' ? AlertTriangle : X;
  const ringColor =
    status === 'success'
      ? 'ring-emerald-400'
      : status === 'warning'
        ? 'ring-amber-400'
        : 'ring-rose-400';
  return (
    <button
      type="button"
      onClick={onSelect}
      role="radio"
      aria-checked={isSelected}
      className={cn(
        'px-2 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1.5 focus:outline-none',
        isSelected
          ? `${STATUS_META[status].solid} shadow-sm ring-2 ring-offset-1 dark:ring-offset-slate-900 ${ringColor}`
          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:ring-slate-700',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={status === 'warning' ? 2.5 : 3} />
      {STATUS_META[status].label}
    </button>
  );
}
