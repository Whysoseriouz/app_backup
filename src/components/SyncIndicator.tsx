'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
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

/**
 * Sync status in the top bar (right side): freshness of the last Veeam
 * import, links to the sync protocol.
 */
export function SyncIndicator() {
  const pathname = usePathname();
  // Shared cache key with the briefing's sync card.
  const { data: status } = useSWR<SyncStatus>('/api/sync/status', {
    refreshInterval: 60_000,
  });

  const last = status?.last_at ? parseUtc(status.last_at) : null;
  const stale = last ? (Date.now() - last.getTime()) / 3_600_000 > 30 : false;
  const label = !status?.enabled
    ? 'Sync aus'
    : !last
      ? 'Sync bereit'
      : `Sync ${formatAge(last)}`;
  const title = !status?.enabled
    ? 'Veeam-Sync ist nicht konfiguriert (SYNC_TOKEN fehlt) – Sync-Protokoll öffnen'
    : last
      ? `Letzter Veeam-Sync: ${last.toLocaleString('de-DE')}${stale ? ' – veraltet' : ''} · Klick öffnet das Sync-Protokoll`
      : 'Noch kein Veeam-Sync empfangen – Sync-Protokoll öffnen';
  const Icon = !status?.enabled || !last || stale ? CloudOff : Cloud;

  return (
    <Link
      href="/sync"
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 transition whitespace-nowrap',
        pathname === '/sync'
          ? 'bg-osk-50 text-osk-700 ring-osk-600/20 dark:bg-osk-500/15 dark:text-osk-300 dark:ring-osk-400/30'
          : stale
            ? 'text-amber-700 ring-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:ring-amber-500/40 dark:hover:bg-amber-500/10'
            : 'text-slate-600 ring-slate-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:ring-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100',
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden min-[1180px]:inline">{label}</span>
      {stale && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
    </Link>
  );
}
