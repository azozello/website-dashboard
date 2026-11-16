/**
 * Settings → Search Console: connect the website's Google Search Console property (api/src/gsc.ts).
 * Not part of the settings draft: connecting, choosing a property and disconnecting take effect at once.
 * Connecting leaves for Google's consent screen; Google returns to /api/gsc/callback, which sends the
 * browser back here with ?gsc=connected|choose|error&reason=….
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../auth/client';
import { weekLabel } from '../data/model';
import './settings.css';
import { ago } from './siteApi';

interface Connection {
  status: 'needs_property' | 'active' | 'error';
  property: string | null;
  googleEmail: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  syncedThrough: string | null;
  lastError: string | null;
  syncing: boolean;
  /** The account's properties that match the website's addresses. */
  candidates: string[];
  /** All of the account's properties (owners and admins only). */
  accountProperties?: string[];
}
interface GscState {
  available: boolean;
  origins: string[];
  connection: Connection | null;
}

const RETURN_ERROR: Record<string, string> = {
  denied: 'You cancelled on Google’s page. Nothing was connected.',
  scope_missing: 'Google didn’t grant access to Search Console. Connect again and keep the Search Console permission ticked.',
  no_refresh_token: 'Google didn’t grant lasting access. Connect again.',
  expired: 'Connecting took too long. Start again.',
  google_error: 'Google answered with an error. Try again in a minute.',
  not_configured: 'This server isn’t set up to connect Search Console.',
  forbidden: 'Only owners and admins can connect Search Console.',
  invalid_state: 'That connection attempt was already used or was started by someone else. Start again.',
};

const LAST_ERROR: Record<string, string> = {
  token_revoked:
    'Google ended the access: it was removed in the Google account, or, while the Google app is still in testing mode, 7 days have passed.',
  no_access: 'The Google account no longer has access to this Search Console property.',
  token_unreadable: 'The stored access can’t be read any more.',
  google_unavailable: 'Google wasn’t reachable at the last import. It is tried again every hour.',
  sync_failed: 'The last import failed. It is tried again every hour.',
};

const POLL_MS = 4000;
const POLL_FOR_MS = 2 * 60_000;

const propertyKind = (p: string) => (p.startsWith('sc-domain:') ? 'Domain property: every address of the domain' : 'URL-prefix property');

export function SearchConsoleTab({ siteId, canEdit }: { siteId: string; canEdit: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<GscState | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [choice, setChoice] = useState('');
  const [pollUntil, setPollUntil] = useState(0);

  const load = useCallback(async () => {
    try {
      const s = await api<GscState>(`/api/sites/${siteId}/gsc`);
      setState(s);
      setChoice((c) => (c && s.connection?.candidates.includes(c) ? c : (s.connection?.candidates[0] ?? '')));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Google's redirect back: say what happened once, then drop the query.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const result = q.get('gsc');
    if (!result) return;
    if (result === 'connected') {
      setMsg({ kind: 'ok', text: 'Search Console is connected. The first import (the last 14 months) is running and takes a minute or two.' });
      setPollUntil(Date.now() + POLL_FOR_MS);
    } else if (result === 'choose') setMsg({ kind: 'ok', text: 'Connected. Choose which Search Console property belongs to this website.' });
    else setMsg({ kind: 'err', text: RETURN_ERROR[q.get('reason') ?? ''] ?? 'Connecting didn’t work. Try again.' });
    navigate({ search: '' }, { replace: true });
  }, [location.search, navigate]);

  // While an import runs (or may be about to start), look again every few seconds.
  const syncing = Boolean(state?.connection?.syncing);
  useEffect(() => {
    if (!syncing && pollUntil < Date.now()) return;
    const t = setInterval(() => {
      if (!syncing && Date.now() > pollUntil) setPollUntil(0);
      else void load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [syncing, pollUntil, load]);

  async function run(fn: () => Promise<void>, failText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof ApiError && err.status === 403 ? 'Only owners and admins can change this.' : failText });
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    run(async () => {
      const r = await api<{ url: string }>(`/api/sites/${siteId}/gsc/connect`, { method: 'POST' });
      window.location.assign(r.url);
      await new Promise(() => {}); // leaving the page; keep the button disabled
    }, 'Couldn’t start connecting. Try again.');

  const choose = () =>
    run(async () => {
      setState(await api<GscState>(`/api/sites/${siteId}/gsc/property`, { method: 'PUT', body: { property: choice } }));
      setMsg({ kind: 'ok', text: 'Saved. The first import is running and takes a minute or two.' });
      setPollUntil(Date.now() + POLL_FOR_MS);
    }, 'Couldn’t use that property. Reload and try again.');

  const syncNow = () =>
    run(async () => {
      await api(`/api/sites/${siteId}/gsc/sync`, { method: 'POST' });
      setPollUntil(Date.now() + POLL_FOR_MS);
      await load();
    }, 'Couldn’t start the import. Try again.');

  const disconnect = () => {
    if (!window.confirm('Disconnect Search Console? The imported search terms are deleted. You can connect again at any time.')) return;
    void run(async () => {
      await api(`/api/sites/${siteId}/gsc`, { method: 'DELETE' });
      await load();
      setMsg({ kind: 'ok', text: 'Search Console is disconnected.' });
    }, 'Couldn’t disconnect. Try again.');
  };

  if (failed && !state) return <p className="err">Couldn't load the Search Console connection. Reload the page to try again.</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const c = state.connection;
  const addresses = state.origins.join(', ');

  return (
    <>
      {msg && (
        <p className={msg.kind} role={msg.kind === 'err' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      )}
      <section className="panel set-card" aria-label="Google Search Console">
        <h2>Google Search Console</h2>
        <p className="muted">
          The search terms that bring visitors from Google, with clicks and positions per page. Read-only: nothing is changed in Search Console.
        </p>

        {!state.available ? (
          <p>This server isn’t set up to connect Search Console yet.</p>
        ) : !c ? (
          <>
            <p>
              Sign in with a Google account that has this website in Search Console ({addresses}). Rate 1 picks the property that matches these addresses
              and imports the last 14 months, then new days once a day.
            </p>
            {canEdit ? (
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => void connect()}>
                  Connect Search Console
                </button>
              </div>
            ) : (
              <p className="muted">Only owners and admins can connect it.</p>
            )}
          </>
        ) : c.status === 'needs_property' && c.candidates.length ? (
          <>
            <p>
              Connected as {c.googleEmail ?? 'your Google account'}. More than one Search Console property matches this website. Choose the one to
              import:
            </p>
            <div className="set-radios" role="radiogroup" aria-label="Search Console property">
              {c.candidates.map((p) => (
                <label key={p} className="set-radio">
                  <input type="radio" name="gsc-property" value={p} checked={choice === p} disabled={!canEdit || busy} onChange={() => setChoice(p)} />
                  <span>
                    <b>{p.replace(/^sc-domain:/, '')}</b>
                    <small className="muted">{propertyKind(p)}</small>
                  </span>
                </label>
              ))}
            </div>
            {canEdit && (
              <div className="row">
                <button className="btn primary" disabled={!choice || busy} onClick={() => void choose()}>
                  Use this property
                </button>
                <button className="btn" disabled={busy} onClick={() => void connect()}>
                  Use another Google account
                </button>
              </div>
            )}
          </>
        ) : c.status === 'needs_property' ? (
          <>
            <p>
              {c.googleEmail ?? 'This Google account'} has no verified Search Console property for {addresses}.
            </p>
            {c.accountProperties?.length ? <p className="muted">It has access to: {c.accountProperties.join(', ')}.</p> : null}
            <p className="muted">
              Add the website in Search Console, or connect a Google account that already has it. If the website’s address is missing from the list
              above, add it on the Website tab first.
            </p>
            {canEdit && (
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => void connect()}>
                  Connect another Google account
                </button>
                <button className="btn danger" disabled={busy} onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            )}
          </>
        ) : c.status === 'error' ? (
          <>
            <p>The connection stopped working. {LAST_ERROR[c.lastError ?? ''] ?? ''}</p>
            <p className="muted">Imported search terms stay until you connect again or disconnect.</p>
            {canEdit && (
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => void connect()}>
                  Connect again
                </button>
                <button className="btn danger" disabled={busy} onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <dl className="set-facts">
              <dt>Property</dt>
              <dd>
                <code>{c.property}</code>
              </dd>
              <dt>Google account</dt>
              <dd>{c.googleEmail ?? '–'}</dd>
              <dt>Last import</dt>
              <dd>
                {c.syncing
                  ? 'Running now…'
                  : c.lastSyncAt
                    ? `${ago(c.lastSyncAt)}${c.syncedThrough ? `, data through ${weekLabel(c.syncedThrough)}` : ''}`
                    : 'Not yet'}
              </dd>
            </dl>
            {c.lastError && <p className="muted">{LAST_ERROR[c.lastError] ?? c.lastError}</p>}
            <p className="muted">Imported once a day. Google’s numbers for the last 2–3 days are still incomplete.</p>
            {canEdit && (
              <div className="row">
                <button className="btn small" disabled={busy || c.syncing} onClick={() => void syncNow()}>
                  Import now
                </button>
                <button className="btn small danger" disabled={busy} onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
