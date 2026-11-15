import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

/** Dashboard views live under /s/:siteId; the server checks that id on every API call. */
export const useSiteId = () => useParams().siteId ?? '';

export const sitePath = (siteId: string, to: string) => `/s/${siteId}${to === '/' ? '' : to}`;

/** navigate() for in-site paths written as before ("/", "/pages/home", "/sources"). */
export function useSiteNavigate() {
  const siteId = useSiteId();
  const navigate = useNavigate();
  return useCallback((to: string) => navigate(sitePath(siteId, to)), [navigate, siteId]);
}
