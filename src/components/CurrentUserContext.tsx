'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Role } from '@/lib/auth';

export interface CurrentUser {
  id: number;
  username: string;
  role: Role;
}

interface Ctx {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Forget the user locally (logout). */
  clear: () => void;
}

const CurrentUserContext = createContext<Ctx>({
  user: null,
  loading: true,
  refresh: async () => {},
  clear: () => {},
});

// Per-tab cache of the last known user. Lets role-dependent buttons render
// right after a reload instead of popping in after /api/auth/me, while the
// pages stay static. Only affects what is shown – the server checks rights.
const STORAGE_KEY = 'backup-check:user';

function readCached(): CurrentUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

function writeCached(user: CurrentUser | null) {
  try {
    if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function CurrentUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const next = res.ok ? ((await res.json()).user ?? null) : null;
      setUser(next);
      writeCached(next);
    } catch {
      /* offline: keep the cached user */
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setUser(null);
    writeCached(null);
  }, []);

  useEffect(() => {
    const cached = readCached();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
    // Always confirm with the server in the background.
    refresh();
  }, [refresh]);

  return (
    <CurrentUserContext.Provider value={{ user, loading, refresh, clear }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): Ctx {
  return useContext(CurrentUserContext);
}

export function useRole(): Role | null {
  const { user } = useCurrentUser();
  return user?.role ?? null;
}

export function useCan(required: Role): boolean {
  const role = useRole();
  if (!role) return false;
  const rank: Record<Role, number> = { read: 0, write: 1, admin: 2 };
  return rank[role] >= rank[required];
}
