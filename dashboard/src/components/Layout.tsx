import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RANGES } from '../lib/analysis';
import { PAGES } from '../mock/data';
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
  return (
    <header className="top">
      <div className="logo">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <path d="M2 5h22l-7 8v8l-8 3v-11z" fill="none" stroke="#1C2826" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="13" cy="9" r="2" fill="#2B4FB3" />
        </svg>
        Website Dashboard
      </div>
      <button className="site" aria-label="Switch website">
        <span className="fav" aria-hidden="true">
          P
        </span>
        <span>
          <small>Website</small>
          <b>physio-example.com</b>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A6764" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="grow" />
      <div className="seg" role="group" aria-label="Date range">
        {RANGES.map(([r, label]) => (
          <button key={r} aria-pressed={r === range} onClick={() => setRange(r)}>
            {label}
          </button>
        ))}
      </div>
      <span className="demo">Demo data</span>
    </header>
  );
}

function Rail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
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
    <button key={to} className={sub ? 'sub' : undefined} aria-current={pathname === to ? 'page' : undefined} onClick={() => navigate(to)}>
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
