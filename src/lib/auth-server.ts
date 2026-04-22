import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifySession, type SessionUser } from './auth';

export async function getCurrentUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
