import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api, authClient, errorText } from './client';
import { rememberSite, useMe } from './session';
import { AuthCard, ErrorLine, Field } from './ui';

interface Created {
  site: { id: string; name: string };
  siteKey: string;
  siteSecret: string;
  webhookUrl?: string;
  scriptTag: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';

/**
 * First run (no organisation yet): create the organisation, then its first website.
 * "Add website" from the site switcher lands here with ?org=<id>.
 */
export function Onboarding() {
  const { me, refresh } = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const manageable = me.orgs.filter((o) => o.role === 'owner' || o.role === 'admin');
  const [orgId, setOrgId] = useState(params.get('org') ?? manageable[0]?.id ?? '');
  const [created, setCreated] = useState<Created | null>(null);

  if (created) {
    return (
      <AuthCard title="Website added" lead="Add this tag to the <head> of every page. Keep the secret: it is shown only now." wide>
        <Secret label="Script tag" value={created.scriptTag} />
        <Secret label="Site key (public)" value={created.siteKey} />
        <Secret label="Site secret (server-side only: WordPress plugin, PHP helper)" value={created.siteSecret} />
        {created.webhookUrl && <Secret label="Wix webhook URL" value={created.webhookUrl} />}
        <button
          className="btn primary"
          onClick={async () => {
            await refresh();
            rememberSite(created.site.id);
            navigate(`/s/${created.site.id}`, { replace: true });
          }}
        >
          I've saved it. Open the dashboard
        </button>
      </AuthCard>
    );
  }

  if (!orgId) return <CreateOrg onCreated={async (id) => (await refresh(), setOrgId(id))} />;
  return <AddSite orgId={orgId} orgs={manageable} onOrg={setOrgId} onCreated={setCreated} canCancel={me.sites.length > 0} />;
}

function CreateOrg({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const suffix = Math.random().toString(36).slice(2, 6);
    const { data, error } = await authClient.organization.create({ name: name.trim(), slug: `${slugify(name)}-${suffix}` });
    setBusy(false);
    if (error || !data) return setError(errorText(error));
    onCreated(data.id);
  }

  return (
    <AuthCard title="Set up your organisation" lead="Your organisation owns your websites. You can invite colleagues to it later.">
      <form onSubmit={submit} className="form">
        <Field label="Organisation name" placeholder="e.g. Physio Example GmbH" required value={name} onChange={(e) => setName(e.target.value)} />
        <ErrorLine>{error}</ErrorLine>
        <button className="btn primary" disabled={busy}>
          Continue
        </button>
      </form>
    </AuthCard>
  );
}

function AddSite({
  orgId,
  orgs,
  onOrg,
  onCreated,
  canCancel,
}: {
  orgId: string;
  orgs: { id: string; name: string }[];
  onOrg: (id: string) => void;
  onCreated: (c: Created) => void;
  canCancel: boolean;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [platform, setPlatform] = useState<'wordpress' | 'wix' | 'php'>('wordpress');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const address = /^https?:\/\//i.test(origin.trim()) ? origin.trim() : `https://${origin.trim()}`;
    try {
      onCreated(await api<Created>(`/api/orgs/${encodeURIComponent(orgId)}/sites`, { body: { name: name.trim() || new URL(address).hostname, platform, origins: [address] } }));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? 'Enter the website address, e.g. https://www.example.com' : err instanceof ApiError && err.status === 403 ? 'Only owners and admins can add websites.' : 'Could not add the website. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Add your website">
      <form onSubmit={submit} className="form">
        {orgs.length > 1 && (
          <label className="field">
            <span>Organisation</span>
            <select value={orgId} onChange={(e) => onOrg(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Field label="Website address" placeholder="https://www.example.com" required value={origin} onChange={(e) => setOrigin(e.target.value)} />
        <Field label="Name (optional)" placeholder="Shown in the dashboard" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="field">
          <span>Built with</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
            <option value="wordpress">WordPress</option>
            <option value="wix">Wix</option>
            <option value="php">Custom / PHP</option>
          </select>
        </label>
        <ErrorLine>{error}</ErrorLine>
        <button className="btn primary" disabled={busy}>
          Add website
        </button>
        {canCancel && (
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
        )}
      </form>
    </AuthCard>
  );
}

function Secret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
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
    </div>
  );
}
