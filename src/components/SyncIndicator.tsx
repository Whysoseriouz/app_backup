'use client';

import { useEffect, useState } from 'react';
import { Cloud, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncStatus {
  enabled: boolean;
  last_at: string | null;
  last_date: string | null;
  total: number;
}

function parseUtc(s: string): Date {
  // SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC
  return new Date(s.replace(' ', 'T') + 'Z');
}

function formatAge(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tg.`;
}

export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/sync/status', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as SyncStatus;
        if (!cancelled) setStatus(json);
      } catch {
        /* network hiccup, try again later */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status || !status.enabled) return null;

  if (!status.last_at) {
    return (
      <div
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500"
        title="Sync aktiv, aber noch keine Daten empfangen"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>Sync bereit</span>
      </div>
    );
  }

  const last = parseUtc(status.last_at);
  const ageHours = (Date.now() - last.getTime()) / 3_600_000;
  const stale = ageHours > 30;
  const time = last.toLocaleString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-xs whitespace-nowrap',
        stale
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-500 dark:text-slate-400',
      )}
      title={`Letzter Veeam-Sync: ${time} · ${status.total} Einträge gesamt`}
    >
      {stale ? (
        <CloudOff className="h-3.5 w-3.5" />
      ) : (
        <Cloud className="h-3.5 w-3.5" />
      )}
      <span>
        Sync {formatAge(last)}
        {stale && ' — veraltet'}
      </span>
    </div>
  );
}
