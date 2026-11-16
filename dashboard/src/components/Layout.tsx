import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteSwitcher, UserMenu } from '../auth/menus';
import { useMe } from '../auth/session';
import { Logo } from '../auth/ui';
import { RANGES } from '../lib/analysis';
import { useStats } from '../data/stats';
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

/** Setup and settings pages show configuration, not report data: no date range. */
const isAdminPath = (pathname: string, siteId: string) => /^\/(setup|settings)(\/|$)/.test(pathname.slice(sitePath(siteId, '/').length));

function TopBar() {
  const { range, setRange } = useDashboard();
  const { pathname } = useLocation();
  const siteId = useSiteId();
  const { me } = useMe();
  const orgId = me.sites.find((s) => s.id === siteId)?.orgId;
  const admin = isAdminPath(pathname, siteId);
  const ref = useRef<HTMLElement>(null);
  // Publish the bar's real height so the sticky rail sits exactly below it, even when the bar wraps.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--top-h', `${el.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header className="top" ref={ref}>
      <Logo />
      <SiteSwitcher siteId={siteId} />
      <div className="grow" />
      {!admin && (
        <div className="seg" role="group" aria-label="Date range">
          {RANGES.map(([r, label]) => (
            <button key={r} aria-pressed={r === range} onClick={() => setRange(r)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <UserMenu orgId={orgId} />
    </header>
  );
}

function Rail() {
  const { pathname } = useLocation();
  const navigate = useSiteNavigate();
  const siteId = useSiteId();
  const ref = useRef<HTMLElement>(null);
  const pages = useStats().data?.pages ?? [];

  // Keep the current section in view inside the rail. On phones the rail is a horizontal strip: centre it.
  // On short desktop screens the rail scrolls vertically: reveal it only when hidden, so a click never shifts the rail.
  useEffect(() => {
    const rail = ref.current;
    const btn = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !btn) return;
    const r = rail.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    // Instant: a smooth scroll gets cancelled by the page's scroll-to-top on navigation.
    if (rail.scrollWidth > rail.clientWidth) rail.scrollLeft += b.left - r.left - (r.width - b.width) / 2;
    if (b.top < r.top) rail.scrollTop += b.top - r.top - 12;
    else if (b.bottom > r.bottom) rail.scrollTop += b.bottom - r.bottom + 12;
  }, [pathname]);

  /** `nested`: also current on sub-pages (Settings tabs). */
  const item = (to: string, label: string, sub?: boolean, nested?: boolean) => {
    const here = sitePath(siteId, to);
    const current = pathname === here || (nested && pathname.startsWith(here + '/'));
    return (
      <button key={to} className={sub ? 'sub' : undefined} aria-current={current ? 'page' : undefined} onClick={() => navigate(to)}>
        {label}
      </button>
    );
  };
  return (
    <nav ref={ref} className="rail" aria-label="Sections">
      {item('/', 'Overview')}
      {pages.length > 0 && (
        <>
          <div className="label">Pages</div>
          {pages.map((p) => item(pagePath(p), p.name, true))}
        </>
      )}
      <div className="sep" />
      <div className="label">All pages combined</div>
      {SITE_VIEWS.map(([to, label]) => item(to, label))}
      <div className="sep" />
      <div className="label">This website</div>
      {item('/setup', 'Setup checklist')}
      {item('/settings', 'Settings', false, true)}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Layout effect: reset scroll before paint, so the new page never flashes at the old scroll position.
  useLayoutEffect(() => {
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
