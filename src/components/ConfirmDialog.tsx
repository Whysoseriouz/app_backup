'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  onConfirm,
  variant = 'default',
  icon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: 'default' | 'destructive';
  icon?: React.ReactNode;
}) {
  const destructive = variant === 'destructive';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm animate-overlay-in dark:bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,440px)] rounded-2xl bg-white ring-1 ring-slate-200 shadow-pop p-5 animate-dialog-in focus:outline-none dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'mt-0.5 h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
                destructive
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                  : 'bg-osk-50 text-osk-600 dark:bg-osk-500/15 dark:text-osk-300',
              )}
            >
              {icon ?? <AlertTriangle className="h-5 w-5" strokeWidth={2} />}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description asChild>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {description}
                  </div>
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 -m-1 rounded"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-md">
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              autoFocus
              onClick={async () => {
                await onConfirm();
                onOpenChange(false);
              }}
              className={cn(
                'px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-slate-900',
                destructive
                  ? 'bg-rose-500 text-white hover:bg-rose-600 focus:ring-rose-500'
                  : 'bg-osk-600 text-white hover:bg-osk-700 focus:ring-osk-500',
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
