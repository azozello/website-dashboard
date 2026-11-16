import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../auth/client';
import { useDashboard } from '../state';
import { buildSiteData, type SiteData, type StatsResponse } from './model';

interface StatsState {
  /** Null until the first response for this site arrives. */
  data: SiteData | null;
  /** A newer range is being fetched; `data` still shows the previous one. */
  loading: boolean;
  error: boolean;
}

const Ctx = createContext<StatsState>({ data: null, loading: true, error: false });

/** Loads the site's report data for the selected range; the previous range stays visible while the next one loads. */
export function StatsProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const { range } = useDashboard();
  const [state, setState] = useState<StatsState & { siteId: string }>({ siteId, data: null, loading: true, error: false });

  useEffect(() => {
    let live = true;
    setState((s) => (s.siteId === siteId ? { ...s, loading: true, error: false } : { siteId, data: null, loading: true, error: false }));
    api<StatsResponse>(`/api/sites/${encodeURIComponent(siteId)}/stats?weeks=${range}`)
      .then((r) => live && setState({ siteId, data: buildSiteData(r), loading: false, error: false }))
      .catch(() => live && setState((s) => ({ ...s, loading: false, error: true })));
    return () => {
      live = false;
    };
  }, [siteId, range]);

  // Never show another site's data while switching.
  const value = state.siteId === siteId ? state : { data: null, loading: true, error: false };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStats = () => useContext(Ctx);

/** For report views, which only render once data is there (see App.tsx). */
export function useSiteData(): SiteData {
  const { data } = useContext(Ctx);
  if (!data) throw new Error('useSiteData outside a loaded <StatsProvider>');
  return data;
}
