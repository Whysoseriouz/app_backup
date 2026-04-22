'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, List, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

const items = [
  { href: '/', label: 'Übersicht', icon: LayoutGrid },
  { href: '/jobs', label: 'Jobs', icon: List },
  { href: '/report', label: 'Bericht', icon: FileText },
];

export function NavBar({ badge }: { badge?: number }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b-[3px] border-osk-600 dark:bg-slate-950/90 no-print">
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 py-3 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/favicon.png"
            alt="OrgaSoft Kommunal"
            width={40}
            height={40}
            priority
            className="h-10 w-10 drop-shadow-sm"
          />
          <div className="leading-tight">
            <div className="font-bold text-[15px] tracking-tight text-slate-900 dark:text-slate-100">
              Backup Check
            </div>
            <div className="text-[11px] font-medium tracking-wide text-osk-600 dark:text-osk-300 uppercase">
              OrgaSoft Kommunal
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 ml-4">
          {items.map((it) => {
            const Icon = it.icon;
            const active = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition',
                  active
                    ? 'bg-osk-50 text-osk-700 dark:bg-osk-500/15 dark:text-osk-300'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {typeof badge === 'number' && badge > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 px-3 py-1 text-xs font-medium dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {badge} offen heute
            </div>
          )}
          {typeof badge === 'number' && badge === 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20 px-3 py-1 text-xs font-medium dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Heute alles bestätigt
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
