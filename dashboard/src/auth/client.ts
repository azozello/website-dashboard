import { organizationClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client. Same origin as the API (/api/auth/*): the session is a
 * host-only HttpOnly cookie, so nothing auth-related is kept in JS storage.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient(), twoFactorClient()],
});

/**
 * authClient.useSession, but only a well-formed session counts as signed in. If /api is misrouted (e.g. a static
 * server answering index.html) the client can hand back a string; treat anything without a user id as signed out.
 */
export function useAuthSession() {
  const { data, isPending } = authClient.useSession();
  const session = data && typeof data === 'object' && typeof data.user?.id === 'string' ? data : null;
  return { session, isPending };
}

export type Role = 'owner' | 'admin' | 'member';

export interface Me {
  user: { userId: string; email: string; name: string; twoFactorEnabled: boolean; signInMethods: string[] };
  orgs: { id: string; name: string; slug: string; role: Role }[];
  sites: { id: string; name: string; platform: 'php' | 'wordpress' | 'wix'; orgId: string; orgName: string; role: Role; origins: string[] }[];
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** JSON call to our own API (/api/…, same origin, cookie sent automatically). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/** Only same-app paths are allowed as post-login destinations (no open redirects). */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : fallback;
}

/** Better Auth error → one readable line. */
export function errorText(err: { message?: string; code?: string; status?: number } | null | undefined, fallback = 'Something went wrong. Try again.'): string {
  if (!err) return fallback;
  if (err.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return err.message || fallback;
}
