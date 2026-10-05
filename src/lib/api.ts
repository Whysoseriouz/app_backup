'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { mutate as globalMutate } from 'swr';

// ---------------------------------------------------------------------------
// Activity counter: every request through fetchJson counts as "busy", which
// drives the spinner in the NavBar.
// ---------------------------------------------------------------------------
let pending = 0;
const busyListeners = new Set<() => void>();
function setPending(delta: number) {
  pending = Math.max(0, pending + delta);
  busyListeners.forEach((l) => l());
}

/** True while at least one request is running. */
export function useBusy(): boolean {
  return useSyncExternalStore(
    (l) => {
      busyListeners.add(l);
      return () => busyListeners.delete(l);
    },
    () => pending > 0,
    () => false,
  );
}

/**
 * Like useBusy, but only turns true after `delayMs` so quick requests
 * (~30 ms) don't make the spinner flicker.
 */
export function useDelayedBusy(delayMs = 300): boolean {
  const busy = useBusy();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!busy) {
      setShown(false);
      return;
    }
    const id = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(id);
  }, [busy, delayMs]);
  return shown;
}

// ---------------------------------------------------------------------------
// Toasts for errors that used to fail silently.
// ---------------------------------------------------------------------------
export interface Toast {
  id: number;
  message: string;
  tone: 'error' | 'info';
}
let toasts: Toast[] = [];
let nextToastId = 1;
const toastListeners = new Set<() => void>();
function emitToasts() {
  toastListeners.forEach((l) => l());
}

export function notify(message: string, tone: Toast['tone'] = 'error') {
  const id = nextToastId++;
  toasts = [...toasts, { id, message, tone }];
  emitToasts();
  setTimeout(() => dismissToast(id), 6000);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

const noToasts: Toast[] = [];
export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => noToasts,
  );
}

// ---------------------------------------------------------------------------
// fetch wrapper
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** JSON fetch that counts as background activity and throws on HTTP errors. */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  setPending(1);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      ...rest,
      ...(json !== undefined
        ? {
            body: JSON.stringify(json),
            headers: { 'content-type': 'application/json', ...rest.headers },
          }
        : {}),
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg =
        (body && typeof body.error === 'string' && body.error) ||
        (res.status === 401
          ? 'Sitzung abgelaufen – bitte neu anmelden.'
          : res.status === 403
            ? 'Dafür fehlt die Berechtigung.'
            : `Fehler ${res.status}`);
      throw new ApiError(msg, res.status);
    }
    return body as T;
  } finally {
    setPending(-1);
  }
}

/** Default SWR fetcher (configured in Providers). */
export const swrFetcher = (url: string) => fetchJson(url);

/**
 * After a confirmation changed: mark everything derived from confirmations as
 * stale (all overview ranges, job histories, cell sync reports).
 */
const CONFIRMATION_KEYS = ['/api/overview', '/api/jobs/', '/api/sync/report'];
export function revalidateConfirmations() {
  return globalMutate(
    (key) =>
      typeof key === 'string' && CONFIRMATION_KEYS.some((p) => key.startsWith(p)),
  );
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
