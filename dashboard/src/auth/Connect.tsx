import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from './client';
import { CreateOrg } from './Onboarding';
import { useMe } from './session';
import { AuthCard, ErrorLine } from './ui';

const STATE = /^[A-Za-z0-9._~-]{8,200}$/;

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

const ERRORS: Record<string, string> = {
  origin_not_allowed: "That website doesn't list this WordPress address. Add it as a new website instead.",
  not_wordpress: 'That website is not a WordPress site.',
  return_url_not_on_site: 'The return address is not on this WordPress site. Start again from WordPress.',
  https_required: 'WordPress must use https to connect.',
};

/**
 * /connect/wordpress?home_url=…&return_url=…&state=… (contract §8, step 2).
 * Opened by the plugin's "Connect to Rate 1" button. The signed-in owner/admin picks the organisation and
 * website, confirms, and the browser goes back to WordPress with a one-time code.
 */
export function ConnectWordPress() {
  const { me, refresh } = useMe();
  const [params] = useSearchParams();
  const homeUrl = params.get('home_url') ?? '';
  const returnUrl = params.get('return_url') ?? '';
  const state = params.get('state') ?? '';

  const home = parse(homeUrl);
  const back = parse(returnUrl);
  const origin = home?.origin ?? '';
  const valid = Boolean(home && back && back.origin === origin && STATE.test(state));

  const manageable = me.orgs.filter((o) => o.role === 'owner' || o.role === 'admin');
  const [orgId, setOrgId] = useState(manageable[0]?.id ?? '');
  const matches = useMemo(
    () => me.sites.filter((s) => s.orgId === orgId && s.platform === 'wordpress' && s.origins.includes(origin)),
    [me.sites, orgId, origin],
  );
  const [choice, setChoice] = useState<string>('new');
  useEffect(() => setChoice(matches[0]?.id ?? 'new'), [matches]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!valid) {
    return (
      <AuthCard title="Connect WordPress">
        <ErrorLine>This connect link is incomplete or doesn't belong to one WordPress site.</ErrorLine>
        <p className="hint-line">Start again from WordPress: Settings → Rate 1 → Connect to Rate 1.</p>
      </AuthCard>
    );
  }

  if (!manageable.length) {
    return (
      <CreateOrg
        lead={
          me.orgs.length
            ? 'Only owners and admins can connect websites. Ask one to do it, or create your own organisation for this site.'
            : 'First, set up the organisation that will own this website.'
        }
        onCreated={async (id) => {
          await refresh();
          setOrgId(id);
        }}
      />
    );
  }

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ redirectUrl: string }>(`/api/orgs/${encodeURIComponent(orgId)}/connect/wordpress`, {
        body: { homeUrl, returnUrl, state, ...(choice === 'new' ? {} : { siteId: choice }) },
      });
      window.location.assign(res.redirectUrl); // back to WordPress with the one-time code
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      setError((code && ERRORS[code]) || 'Could not connect. Try again.');
      setBusy(false);
    }
  }

  function cancel() {
    const u = new URL(back!.toString());
    u.searchParams.set('error', 'access_denied');
    u.searchParams.set('state', state);
    window.location.assign(u.toString());
  }

  return (
    <AuthCard title="Connect WordPress" lead={<>Connect <b>{origin}</b> to Rate 1? WordPress gets this website's keys and starts sending page views and form requests.</>}>
      <div className="form">
        {manageable.length > 1 && (
          <label className="field">
            <span>Organisation</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {manageable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="choices">
          <legend>Website</legend>
          {matches.map((s) => (
            <label key={s.id} className="check">
              <input type="radio" name="site" checked={choice === s.id} onChange={() => setChoice(s.id)} /> {s.name} <span className="muted">(already in Rate 1)</span>
            </label>
          ))}
          <label className="check">
            <input type="radio" name="site" checked={choice === 'new'} onChange={() => setChoice('new')} /> Add {new URL(origin).host} as a new website
          </label>
        </fieldset>
        {choice !== 'new' && <p className="hint-line">Connecting gives this website a new site secret. Anything else still using the old one stops reporting form requests.</p>}
        <ErrorLine>{error}</ErrorLine>
        <button className="btn primary" disabled={busy} onClick={connect}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={cancel}>
          Cancel
        </button>
      </div>
    </AuthCard>
  );
}
