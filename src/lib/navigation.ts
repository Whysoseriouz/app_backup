'use client';

import { useEffect, useSyncExternalStore } from 'react';

// Path the user just navigated to (set on click, cleared once the new page is
// shown). Lets the NavBar highlight move and the overlay appear immediately,
// before Next.js has rendered the new page.
let pendingPath: string | null = null;
const listeners = new Set<() => void>();

export function setPendingPath(path: string | null) {
  if (pendingPath === path) return;
  pendingPath = path;
  listeners.forEach((l) => l());
}

export function usePendingPath(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pendingPath,
    () => null,
  );
}

// Pages report "still building" here (e.g. the matrix before its table is
// rendered). The navigation overlay stays up while any page is not ready.
let pagesBusy = 0;
const busyListeners = new Set<() => void>();
function addPageBusy(delta: number) {
  pagesBusy = Math.max(0, pagesBusy + delta);
  busyListeners.forEach((l) => l());
}

export function isPageBusy(): boolean {
  return pagesBusy > 0;
}

export function usePageBusyState(): boolean {
  return useSyncExternalStore(
    (l) => {
      busyListeners.add(l);
      return () => busyListeners.delete(l);
    },
    () => pagesBusy > 0,
    () => false,
  );
}

/** Call in a page: `usePageBusy(!dataReady)`. */
export function usePageBusy(busy: boolean) {
  useEffect(() => {
    if (!busy) return;
    addPageBusy(1);
    return () => addPageBusy(-1);
  }, [busy]);
}
