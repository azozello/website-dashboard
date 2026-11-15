import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteSwitcher, UserMenu } from '../auth/menus';
import { useMe } from '../auth/session';
import { Logo } from '../auth/ui';
import { RANGES } from '../lib/analysis';
import { PAGES } from '../mock/data';
import { sitePath, useSiteId, useSiteNavigate } from '../site';
import { useDashboard } from '../state';
import { pagePath } from './ui';

export const SITE_VIEWS: [string, string][] = [
  ['/search-terms', 'Search terms'],
  ['/sources', 'Sources'],
  ['/devices', 'Devices'],
  ['/contact-options', 'Contact options'],
  ['/click-paths', 'Click paths'],
  ['/changes', 'Changes'],
  ['/requests', 'Requests'],
];

function TopBar() {
  const { range, setRange } = useDashboard();
  const siteId = useSiteId();
  const { me } = useMe();
  const orgId = me.sites.find((s) => s.id === siteId)?.orgId;
  return (
    <header className="top">
      <Logo />
      <SiteSwitcher siteId={siteId} />
      <div className="grow" />
      <div className="seg" role="group" aria-label="Date range">
        {RANGES.map(([r, label]) => (
          <button key={r} aria-pressed={r === range} onClick={() => setRange(r)}>
            {label}
          </button>
        ))}
      </div>
      <span className="demo">Demo data</span>
      <UserMenu orgId={orgId} />
    </header>
  );
}

function Rail() {
  const { pathname } = useLocation();
  const navigate = useSiteNavigate();
  const siteId = useSiteId();
  const ref = useRef<HTMLElement>(null);

  // On phones the rail is a horizontal strip: keep the current section in view.
  useEffect(() => {
    const rail = ref.current;
    const btn = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !btn || rail.scrollWidth <= rail.clientWidth) return;
    const r = rail.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    // Instant: a smooth scroll gets cancelled by the page's scroll-to-top on navigation.
    rail.scrollLeft += b.left - r.left - (r.width - b.width) / 2;
  }, [pathname]);

  const item = (to: string, label: string, sub?: boolean) => (
    <button key={to} className={sub ? 'sub' : undefined} aria-current={pathname === sitePath(siteId, to) ? 'page' : undefined} onClick={() => navigate(to)}>
      {label}
    </button>
  );
  return (
    <nav ref={ref} className="rail" aria-label="Sections">
      {item('/', 'Overview')}
      <div className="label">Pages</div>
      {PAGES.map((p) => item(pagePath(p), p.name, true))}
      <div className="sep" />
      <div className="label">All pages combined</div>
      {SITE_VIEWS.map(([to, label]) => item(to, label))}
      <div className="sep" />
      <div className="client">
        <b>Plan:</b> Rate 1
        <br />
        Next review: Nov 4
      </div>
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <TopBar />
      <div className="shell">
        <Rail />
        <main className="content">{children}</main>
      </div>
    </>
  );
}
