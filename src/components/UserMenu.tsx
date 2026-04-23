'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ChevronDown,
  KeyRound,
  LogOut,
  User as UserIcon,
  Users,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useCurrentUser } from './CurrentUserContext';
import { ROLE_BADGE, ROLE_LABEL } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (loading) {
    return <div className="h-8 w-20 rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse" />;
  }
  if (!user) return null;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-slate-200 bg-white hover:bg-slate-50 dark:ring-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            <UserIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {user.username}
            </span>
            <span
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1',
                ROLE_BADGE[user.role],
              )}
            >
              {ROLE_LABEL[user.role]}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-40 min-w-[200px] rounded-xl bg-white ring-1 ring-slate-200 shadow-pop p-1 animate-fade-in dark:bg-slate-900 dark:ring-slate-800"
          >
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Angemeldet als
              </div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {user.username}
              </div>
            </div>
            <DropdownMenu.Item
              onSelect={() => setPasswordOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 rounded-md cursor-pointer hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 outline-none"
            >
              <KeyRound className="h-4 w-4" />
              Passwort ändern
            </DropdownMenu.Item>
            {user.role === 'admin' && (
              <DropdownMenu.Item asChild>
                <Link
                  href="/users"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 rounded-md cursor-pointer hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 outline-none"
                >
                  <Users className="h-4 w-4" />
                  Benutzer verwalten
                </Link>
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
            <DropdownMenu.Item
              onSelect={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-rose-600 rounded-md cursor-pointer hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 outline-none"
            >
              <LogOut className="h-4 w-4" />
              Abmelden
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <PasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}

function PasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [nextRepeat, setNextRepeat] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setNextRepeat('');
    setError(null);
    setSuccess(false);
    setPending(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== nextRepeat) {
      setError('Neue Passwörter stimmen nicht überein');
      return;
    }
    if (!next) {
      setError('Neues Passwort darf nicht leer sein');
      return;
    }
    setPending(true);
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current, next }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Fehler beim Ändern');
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      onOpenChange(false);
      reset();
    }, 1200);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm animate-overlay-in dark:bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,420px)] rounded-2xl bg-white ring-1 ring-slate-200 shadow-pop p-5 animate-dialog-in focus:outline-none dark:bg-slate-900 dark:ring-slate-800">
          <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Passwort ändern
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 dark:text-slate-400">
                Aktuelles Passwort
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 dark:text-slate-400">
                Neues Passwort
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 dark:text-slate-400">
                Neues Passwort wiederholen
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={nextRepeat}
                onChange={(e) => setNextRepeat(e.target.value)}
                className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
                required
              />
            </div>
            {error && (
              <div className="text-xs text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}
            {success && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400">
                Passwort wurde geaendert.
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Abbrechen
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending || success}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition',
                  pending || success
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                    : 'bg-osk-600 hover:bg-osk-700 text-white',
                )}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Speichern
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
