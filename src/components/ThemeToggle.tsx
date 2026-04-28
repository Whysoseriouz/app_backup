'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme) {
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && sys);
  document.documentElement.classList.toggle('dark', dark);
}

const OPTIONS = [
  { id: 'light' as const, icon: Sun, label: 'Hell' },
  { id: 'system' as const, icon: Monitor, label: 'System' },
  { id: 'dark' as const, icon: Moon, label: 'Dunkel' },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored =
      (localStorage.getItem('backup-check:theme') as Theme | null) ||
      'system';
    setTheme(stored);
    setMounted(true);
    // Re-apply after mount: a Hydration-Mismatch elsewhere can cause
    // React to client-rerender <html> and drop the .dark class set by
    // the inline init script. Re-applying here is the safety net.
    applyTheme(stored);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current =
        (localStorage.getItem('backup-check:theme') as Theme | null) ||
        'system';
      if (current === 'system') applyTheme('system');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  function change(t: Theme) {
    setTheme(t);
    localStorage.setItem('backup-check:theme', t);
    applyTheme(t);
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg p-0.5 ring-1 transition',
        'bg-slate-100 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700',
      )}
      role="radiogroup"
      aria-label="Design"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mounted && theme === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => change(opt.id)}
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            className={cn(
              'p-1.5 rounded-md transition',
              active
                ? 'bg-white dark:bg-slate-950 shadow-sm text-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
