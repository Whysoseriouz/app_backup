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
}

const CurrentUserContext = createContext<Ctx>({
  user: null,
  loading: true,
  refresh: async () => {},
});

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
      if (res.ok) {
        const json = await res.json();
        setUser(json.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CurrentUserContext.Provider value={{ user, loading, refresh }}>
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
