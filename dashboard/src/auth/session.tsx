import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ApiError, api, authClient, useAuthSession, type Me } from './client';

interface MeState {
  me: Me;
  refresh: () => Promise<void>;
}

const Ctx = createContext<MeState | null>(null);

export function useMe() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMe must be used inside <RequireAuth>');
  return v;
}

export function Loading() {
  return (
    <div className="auth-wrap" aria-busy="true">
      <p className="muted">Loading…</p>
    </div>
  );
}

/**
 * Gate for every signed-in route. No session → /login?next=<here>.
 * With a session, loads /api/me (organisations and the sites this user may open).
 * The server checks access again on every API call; this only shapes the UI.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, isPending } = useAuthSession();
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await authClient.getSession(); // session gone: let useSession notice
      else setFailed(true);
    }
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    setMe(null);
    if (userId) void refresh();
  }, [userId, refresh]);

  if (isPending) return <Loading />;
  if (!session) {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (failed) {
    return (
      <div className="auth-wrap">
        <p className="err">Couldn't load your account. Reload the page to try again.</p>
      </div>
    );
  }
  if (!me) return <Loading />;
  return <Ctx.Provider value={{ me, refresh }}>{children ?? <Outlet />}</Ctx.Provider>;
}

const LAST_SITE = 'rate1.lastSite';

export function rememberSite(siteId: string) {
  try {
    localStorage.setItem(LAST_SITE, siteId);
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

/** "/" after sign-in: the last opened site, else the first one, else onboarding. */
export function Home() {
  const { me } = useMe();
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_SITE);
  } catch {
    /* ignore */
  }
  const site = me.sites.find((s) => s.id === last) ?? me.sites[0];
  return <Navigate to={site ? `/s/${site.id}` : '/onboarding'} replace />;
}
