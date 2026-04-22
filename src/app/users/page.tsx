'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Eye,
  Pencil,
} from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useCurrentUser } from '@/components/CurrentUserContext';
import { ROLE_BADGE, ROLE_LABEL, type Role } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface UserRow {
  id: number;
  username: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

const ROLES: { id: Role; desc: string }[] = [
  { id: 'admin', desc: 'Volle Rechte inkl. Benutzerverwaltung' },
  { id: 'write', desc: 'Bestaetigen, Jobs verwalten, Sortieren' },
  { id: 'read', desc: 'Nur lesen — Uebersicht und Bericht' },
];

export default function UsersPage() {
  const router = useRouter();
  const { user: me, loading: meLoading } = useCurrentUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('read');
  const [adding, setAdding] = useState(false);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/users', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as UserRow[];
      setUsers(data);
    } else if (res.status === 403) {
      router.push('/');
      return;
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (!meLoading && me?.role !== 'admin') {
      router.push('/');
      return;
    }
    if (!meLoading && me?.role === 'admin') {
      load();
    }
  }, [me, meLoading, load, router]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newUsername.trim() || !newPassword) return;
    setAdding(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Fehler beim Anlegen');
      return;
    }
    setNewUsername('');
    setNewPassword('');
    setNewRole('read');
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/users/${deleteTarget.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || 'Fehler beim Loeschen');
      return;
    }
    load();
  }

  if (meLoading || (me && me.role !== 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Benutzer verwalten
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
            Admins haben vollen Zugriff inkl. Benutzerverwaltung. Schreiben-
            Nutzer bestaetigen und verwalten Jobs. Lesen-Nutzer sehen nur die
            Uebersicht und den Bericht.
          </p>
        </div>

        <form
          onSubmit={addUser}
          className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft p-4 mb-6 dark:bg-slate-900 dark:ring-slate-800"
        >
          <div className="text-sm font-semibold text-slate-700 mb-3 dark:text-slate-300">
            Neuen Benutzer anlegen
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_180px_auto] gap-2">
            <input
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                setError(null);
              }}
              placeholder="Benutzername"
              className="text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              autoComplete="off"
            />
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Passwort"
              className="text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              autoComplete="new-password"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {ROLE_LABEL[r.id]} — {r.desc}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!newUsername.trim() || !newPassword || adding}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold shadow-soft transition',
                !newUsername.trim() || !newPassword || adding
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                  : 'bg-osk-600 hover:bg-osk-700 text-white',
              )}
            >
              <Plus className="h-4 w-4" />
              Anlegen
            </button>
          </div>
          {error && (
            <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
        </form>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft overflow-hidden dark:bg-slate-900 dark:ring-slate-800">
          <div className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50/50 dark:text-slate-400 dark:border-slate-800 dark:bg-slate-800/40">
            {loading ? 'Laden...' : `Benutzer · ${users.length}`}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <UserRowView
                key={u.id}
                user={u}
                isMe={me?.id === u.id}
                onEdit={() => setEditing(u)}
                onDelete={() => setDeleteTarget(u)}
              />
            ))}
            {!loading && users.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Keine Benutzer vorhanden.
              </div>
            )}
          </div>
        </div>
      </main>

      {editing && (
        <EditUserDialog
          user={editing}
          isMe={me?.id === editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Benutzer loeschen?"
        description={
          deleteTarget ? (
            <>
              Benutzer{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {deleteTarget.username}
              </span>{' '}
              wird entfernt und kann sich nicht mehr anmelden.
            </>
          ) : null
        }
        confirmLabel="Loeschen"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function UserRowView({
  user,
  isMe,
  onEdit,
  onDelete,
}: {
  user: UserRow;
  isMe: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon =
    user.role === 'admin'
      ? ShieldCheck
      : user.role === 'write'
        ? Pencil
        : Eye;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Icon className="h-4 w-4 text-slate-400" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 dark:text-slate-100">
          {user.username}
          {isMe && (
            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
              (Du)
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500">
          Angelegt {new Date(user.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('de-DE')}
        </div>
      </div>
      <span
        className={cn(
          'text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1',
          ROLE_BADGE[user.role],
        )}
      >
        {ROLE_LABEL[user.role]}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          title="Bearbeiten"
        >
          <KeyRound className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={isMe}
          title={isMe ? 'Eigener Account' : 'Loeschen'}
          className={cn(
            'p-1.5 rounded-md',
            isMe
              ? 'text-slate-300 cursor-not-allowed dark:text-slate-700'
              : 'text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EditUserDialog({
  user,
  isMe,
  onClose,
  onSaved,
}: {
  user: UserRow;
  isMe: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user.role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const body: Record<string, unknown> = {};
    if (username.trim() !== user.username) body.username = username.trim();
    if (role !== user.role) body.role = role;
    if (password) body.password = password;
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Fehler beim Speichern');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/70"
        onClick={onClose}
      />
      <form
        onSubmit={save}
        className="relative w-full max-w-md rounded-2xl bg-white ring-1 ring-slate-200 shadow-pop p-5 dark:bg-slate-900 dark:ring-slate-800"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {user.username} bearbeiten
        </h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 dark:text-slate-400">
              Benutzername
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 dark:text-slate-400">
              Neues Passwort{' '}
              <span className="text-slate-400 font-normal">
                (leer lassen = unveraendert)
              </span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 dark:text-slate-400">
              Rolle{' '}
              {isMe && (
                <span className="text-slate-400 font-normal">
                  (eigene Rolle nicht aenderbar)
                </span>
              )}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={isMe}
              className="w-full text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 disabled:opacity-50 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {ROLE_LABEL[r.id]} — {r.desc}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <div className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition',
              pending
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                : 'bg-osk-600 hover:bg-osk-700 text-white',
            )}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
