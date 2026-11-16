/**
 * Setup checklist, contract §12. The API computes the checks (GET /api/sites/:siteId/checks);
 * this page explains each result and how to fix it. The live check opens the website with
 * ?r1_debug=1 (r1.js then sends test events) and re-checks until the test page view arrives.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../auth/client';
import './settings.css';
import { useSiteId, useSiteNavigate } from '../site';
import { ago, type Check, type Checklist, type Platform } from './siteApi';

const POLL_MS = 4000;
const POLL_FOR_MS = 3 * 60_000;

export function SetupChecklist() {
  const siteId = useSiteId();
  const navigate = useSiteNavigate();
  const [data, setData] = useState<Checklist | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveUntil, setLiveUntil] = useState(0);

  const url = `/api/sites/${siteId}/checks`;
  const load = useCallback(async (checksUrl: string) => {
    setBusy(true);
    try {
      setData(await api<Checklist>(checksUrl));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    setLiveUntil(0);
    void load(url);
  }, [url, load]);

  // Live check: poll until the test page view arrives or the window closes.
  const testPassed = data?.checks.find((c) => c.id === 'test_event')?.status === 'pass';
  const live = liveUntil > 0 && !testPassed;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (Date.now() > liveUntil) setLiveUntil(0);
      else void load(url);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [live, liveUntil, load, url]);

  if (failed && !data)
    return (
      <div className="head">
        <h1>Setup checklist</h1>
        <p className="err">Couldn't run the checks. Reload the page to try again.</p>
      </div>
    );
  if (!data) return <p className="muted">Running checks…</p>;

  const startLive = () => {
    // The first allowed address: r1.js only sends from allowed origins.
    const target = new URL('/', data.install.allowedOrigins[0]);
    target.searchParams.set('r1_debug', '1');
    window.open(target.href, '_blank', 'noopener');
    setLiveUntil(Date.now() + POLL_FOR_MS);
  };

  const done = data.checks.filter((c) => c.status === 'pass').length;
  const open = data.checks.filter((c) => c.status === 'pending').length;
  const ctx: Ctx = { data, navigate, startLive, live, liveDone: liveUntil > 0 && testPassed };

  return (
    <div className="setup">
      <div className="head">
        <h1>Setup checklist</h1>
        <p>Checks that tracking on this website works end to end. Fix them from the top: later checks need the earlier ones.</p>
      </div>

      <section className="panel setup-summary" aria-label="Progress">
        <div className="setup-progress">
          <b>
            {done} of {data.checks.length} done
          </b>
          {open > 0 && <span className="muted"> · {open} can't be checked yet</span>}
          <div className="ctrack" aria-hidden="true">
            <div style={{ width: `${(done / data.checks.length) * 100}%` }} />
          </div>
        </div>
        <div className="setup-again">
          <small className="muted" key={data.checkedAt} title={new Date(data.checkedAt).toLocaleString()}>
            Checked {ago(data.checkedAt)}
          </small>
          <button className="btn small" disabled={busy} onClick={() => void load(url)}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </section>
      {failed && <p className="err">The last re-check failed. Showing the previous results.</p>}

      <ol className="checks panel" aria-label="Checks">
        {data.checks.map((c) => (
          <CheckItem key={c.id} check={c} ctx={ctx} />
        ))}
      </ol>
    </div>
  );
}

interface Ctx {
  data: Checklist;
  navigate: (to: string) => void;
  startLive: () => void;
  live: boolean;
  liveDone: boolean;
}

const TITLE: Record<string, string> = {
  script_live: 'Tracking script is live',
  pages_tagged: 'Every page has the script',
  test_event: 'Live check',
  plugin_ok: 'WordPress plugin connected',
  delay_js_ok: 'Caching plugins leave the script alone',
  form_request: 'Requests arrive',
  wix_webhook: 'Wix webhook set up',
  buttons_found: 'Contact buttons found',
  csp_ok: 'Security policy allows tracking',
  gsc_connected: 'Search Console connected',
};

const HEAD_HOOK_ERROR: Record<string, string> = {
  no_site_key: 'no site key is entered in the plugin settings',
  request_failed: "the plugin couldn't load your homepage to check",
  tag_missing: "the script tag isn't in your homepage. The theme may not call wp_head(), or another plugin removes the tag",
};

function StatusIcon({ status }: { status: Check['status'] }) {
  const label = status === 'pass' ? 'Done' : status === 'fail' ? 'Needs attention' : "Can't be checked yet";
  return (
    <span className={`check-icon ${status}`} role="img" aria-label={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {status === 'pass' ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : status === 'fail' ? <path d="M12 7v6M12 17v.01" /> : <path d="M7 12h10" />}
      </svg>
    </span>
  );
}

function CheckItem({ check, ctx }: { check: Check; ctx: Ctx }) {
  const { text, fix } = explain(check, ctx);
  return (
    <li className={`check ${check.status}`}>
      <StatusIcon status={check.status} />
      <div className="check-body">
        <b>{TITLE[check.id] ?? check.id}</b>
        <p>{text}</p>
        {fix && <div className="check-fix">{fix}</div>}
      </div>
    </li>
  );
}

const lastSeen = (c: Check, what: string) => (c.detail?.lastAt ? ` Last ${what} ${ago(c.detail.lastAt)}.` : '');

function installHint(platform: Platform): string {
  if (platform === 'wordpress') return 'The Rate 1 Connector plugin adds it once the site key is entered (or the site is connected).';
  if (platform === 'wix') return 'In Wix: Settings → Custom code → Add code, paste the tag, place it in the head on all pages.';
  return 'Paste it into the <head> of every page, e.g. in the shared header template.';
}

function explain(c: Check, { data, navigate, startLive, live, liveDone }: Ctx): { text: ReactNode; fix?: ReactNode } {
  const toSettings = (tab: string, label: string) => (
    <button className="lnk" onClick={() => navigate(`/settings${tab ? '/' + tab : ''}`)}>
      {label}
    </button>
  );
  const notYet = (what: string) => ({ text: `${what} isn't available yet, so this can't be checked.` });

  switch (c.id) {
    case 'script_live':
      if (c.status === 'pass') return { text: `Page views are arriving.${lastSeen(c, 'page view')}` };
      if (c.reason === 'no_tracking_data') return { text: 'No tracking data is available on this server yet.' };
      return {
        text: c.reason === 'no_pageview_24h' ? `No page view in the last 24 hours.${lastSeen(c, 'one')}` : 'No page view has arrived yet.',
        fix: (
          <>
            <p>Add this tag to every page. {installHint(data.platform)}</p>
            <Copy value={data.install.scriptTag} />
            <p>
              Page views count only from the allowed addresses: {data.install.allowedOrigins.join(', ')}. {toSettings('', 'Change addresses')}
            </p>
          </>
        ),
      };
    case 'pages_tagged':
      return notYet('The page scanner, which compares your sitemap with the pages that have the script,');
    case 'test_event':
      if (c.status === 'pass') return { text: liveDone ? 'The test visit arrived. Tracking works.' : `A test visit arrived in the last hour.${lastSeen(c, 'test')}` };
      if (c.reason === 'no_tracking_data') return { text: 'No tracking data is available on this server yet.' };
      return {
        text: 'Open your website in test mode. A small debug panel shows what is sent; test visits are kept out of your numbers.',
        fix: (
          <div className="row live">
            <button className="btn primary small" onClick={startLive} disabled={!data.install.allowedOrigins.length}>
              {live ? 'Open again' : 'Start live check'}
            </button>
            {live && (
              <span className="muted live-wait" role="status">
                <span className="spinner" aria-hidden="true" /> Waiting for the test visit…
              </span>
            )}
          </div>
        ),
      };
    case 'plugin_ok': {
      const v = c.detail?.pluginVersion ? ` (version ${c.detail.pluginVersion})` : '';
      if (c.status === 'pass') return { text: `The Rate 1 Connector plugin${v} last reported ${ago(c.detail?.lastAt)} and adds the script to your pages.` };
      if (c.reason === 'no_tracking_data') return { text: 'No tracking data is available on this server yet.' };
      if (c.reason === 'no_hello')
        return { text: "The Rate 1 Connector plugin hasn't reported in.", fix: <p>Install and activate the plugin in WordPress, then enter the site key and site secret in its settings and save.</p> };
      if (c.reason === 'hello_stale')
        return { text: `The plugin last reported ${ago(c.detail?.lastAt)}; it reports daily.`, fix: <p>Check that the plugin is still active. Saving its settings makes it report right away.</p> };
      const e = c.detail?.error ?? '';
      const why = HEAD_HOOK_ERROR[e] ?? (e.startsWith('http_') ? `your homepage answered with HTTP ${e.slice(5)}` : 'of an unknown problem');
      return { text: `The plugin can't confirm the script is on your pages: ${why}.`, fix: <p>Fix that, then save the plugin settings so it reports again.</p> };
    }
    case 'delay_js_ok':
      if (c.status === 'pass') return { text: c.reason === 'r1_excluded' ? 'A caching plugin delays JavaScript, but the tracking script is excluded.' : 'No caching plugin delays JavaScript.' };
      if (c.reason === 'no_hello') return { text: 'Checked once the WordPress plugin reports in.' };
      return {
        text: `${(c.detail?.plugins ?? []).join(', ')} delays JavaScript and doesn't exclude the tracking script. Delayed, it misses visitors who leave quickly.`,
        fix: <p>Add r1.js to that plugin's "delay JavaScript" exclusions, then save the Rate 1 Connector settings so it reports again.</p>,
      };
    case 'form_request':
      if (c.status === 'pass') return { text: `Requests are being counted.${lastSeen(c, 'one')}` };
      if (c.reason === 'no_tracking_data') return { text: 'No tracking data is available on this server yet.' };
      return {
        text: c.reason === 'no_request_7d' ? `No counted request in the last 7 days.${lastSeen(c, 'one')}` : 'No request has been counted yet.',
        fix: <p>Send a test enquiry through your contact form. If it doesn't show up, check which method counts for that form: {toSettings('requests', 'Request rules')}.</p>,
      };
    case 'wix_webhook':
      if (c.status === 'pass') return { text: `The Wix Automations webhook is delivering form submissions.${lastSeen(c, 'one')}` };
      if (c.reason === 'no_tracking_data') return { text: 'No tracking data is available on this server yet.' };
      return {
        text: 'No form submission has come through the Wix webhook yet.',
        fix: <p>In Wix Automations, send form submissions to the webhook URL you got when the website was added, then submit the form once.</p>,
      };
    case 'buttons_found':
      if (c.status === 'pass') return { text: `Clicks on phone, email, WhatsApp or booking links are recorded.${lastSeen(c, 'click')}` };
      return {
        text: 'No click on a phone, email, WhatsApp or booking link yet.',
        fix: (
          <p>
            Click one on your website to check. Booking links count when they point to a {toSettings('tracking', 'booking page')}. (The page scanner that finds these
            links by itself isn't available yet.)
          </p>
        ),
      };
    case 'csp_ok':
      return notYet('The page scanner, which reads your homepage’s Content-Security-Policy header,');
    case 'gsc_connected': {
      const go = (label: string) => <p>{toSettings('search-console', label)}</p>;
      if (c.status === 'pass') return { text: `Connected to ${c.detail?.property}.${lastSeen(c, 'import')}` };
      if (c.reason === 'gsc_not_available') return { text: "This server isn't set up to connect Search Console yet, so this can't be checked." };
      if (c.reason === 'no_property') return { text: 'Connected, but the Search Console property for this website still has to be chosen.', fix: go('Choose the property') };
      if (c.reason === 'connection_inactive')
        return {
          text: c.detail?.error === 'token_revoked' ? 'Google ended the Search Console access. Connect it again.' : 'The Search Console connection stopped working. Connect it again.',
          fix: go('Connect again'),
        };
      return { text: 'Connect Search Console to see the search terms that bring visitors.', fix: go('Connect Search Console') };
    }
    default:
      return { text: c.reason };
  }
}

function Copy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy">
      <code>{value}</code>
      <button
        type="button"
        className="btn small"
        onClick={() =>
          navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
