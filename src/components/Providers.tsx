'use client';

import { SWRConfig } from 'swr';
import { X } from 'lucide-react';
import { dismissToast, swrFetcher, useToasts } from '@/lib/api';
import { cn } from '@/lib/utils';
import { NavigationOverlay } from './NavigationOverlay';

/**
 * Client-side data layer: one SWR cache for all pages, so returning to a page
 * shows the last data immediately and refreshes it in the background.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
        // Don't retry on 401/403, a retry won't fix those.
        shouldRetryOnError: (err) =>
          !(err && typeof err === 'object' && 'status' in err &&
            [401, 403].includes((err as { status: number }).status)),
      }}
    >
      {children}
      <NavigationOverlay />
      <Toaster />
    </SWRConfig>
  );
}

function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2 no-print"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm shadow-pop ring-1 animate-fade-in',
            t.tone === 'error'
              ? 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-500/30'
              : 'bg-white text-slate-800 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700',
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Schließen"
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
