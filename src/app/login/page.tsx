'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('backup-check:last-username') || '';
    if (stored) setUsername(stored);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Anmeldung fehlgeschlagen');
        setPending(false);
        return;
      }
      localStorage.setItem('backup-check:last-username', username.trim());
      const next = sp.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch {
      setError('Netzwerkfehler - Server nicht erreichbar');
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 to-osk-50 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/favicon.png"
            alt="OrgaSoft Kommunal"
            width={72}
            height={72}
            priority
            className="drop-shadow-sm mb-3"
          />
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Backup Check
            </div>
            <div className="text-xs font-medium tracking-wide text-osk-600 dark:text-osk-300 uppercase">
              OrgaSoft Kommunal
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft p-6 dark:bg-slate-900 dark:ring-slate-800"
        >
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Anmelden
          </h1>

          <label className="block text-xs font-medium text-slate-600 mb-1 dark:text-slate-400">
            Benutzername
          </label>
          <input
            autoFocus
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="admin"
            disabled={pending}
          />

          <label className="block text-xs font-medium text-slate-600 mt-3 mb-1 dark:text-slate-400">
            Passwort
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 pr-10 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Passwort"
              disabled={pending}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
              tabIndex={-1}
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-md bg-rose-50 text-rose-700 text-xs px-3 py-2 ring-1 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !username || !password}
            className={cn(
              'mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-soft transition',
              pending || !username || !password
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                : 'bg-osk-600 hover:bg-osk-700 text-white',
            )}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {pending ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
          Backup Check · OrgaSoft Kommunal GmbH
        </div>
      </div>
    </div>
  );
}
