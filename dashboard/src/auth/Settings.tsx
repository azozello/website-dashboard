import QRCode from 'qrcode';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, authClient, errorText, type Role } from './client';
import { UserMenu } from './menus';
import { useMe } from './session';
import { ErrorLine, Field, Logo } from './ui';

function SettingsShell({ title, orgId, children }: { title: string; orgId?: string; children: ReactNode }) {
  return (
    <>
      <header className="top">
        <Link to="/" className="logo-link" aria-label="Back to the dashboard">
          <Logo />
        </Link>
        <div className="grow" />
        <UserMenu orgId={orgId} />
      </header>
      <main className="settings">
        <Link to="/" className="crumb">
          ← Dashboard
        </Link>
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel settings-card" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/* ---------- Sign-in & security ---------- */

export function Security() {
  const { me } = useMe();
  const hasPassword = me.user.signInMethods.includes('credential');
  const hasGoogle = me.user.signInMethods.includes('google');
  return (
    <SettingsShell title="Sign-in & security">
      <Card title="How you sign in">
        <ul className="plain">
          <li>
            <b>Email and password</b> {hasPassword ? <span className="tag ok">On</span> : <span className="tag">Not set</span>}
          </li>
          <li>
            <b>Google</b> {hasGoogle ? <span className="tag ok">Linked</span> : <span className="tag">Not linked</span>}
          </li>
        </ul>
        {hasGoogle && <p className="muted">Google sign-ins are protected by your Google account's own 2-Step Verification.</p>}
      </Card>
      {hasPassword ? <TwoStep /> : <Card title="Two-step verification"><p className="muted">You sign in with Google only, so two-step verification is managed in your Google account.</p></Card>}
      {hasPassword && <ChangePassword />}
    </SettingsShell>
  );
}

type Enrol = { totpURI: string; backupCodes: string[]; qr: string };

function TwoStep() {
  const { me, refresh } = useMe();
  const on = me.user.twoFactorEnabled;
  const [mode, setMode] = useState<'idle' | 'enable' | 'disable' | 'codes'>('idle');
  const [password, setPassword] = useState('');
  const [enrol, setEnrol] = useState<Enrol | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode('idle');
    setPassword('');
    setEnrol(null);
    setCode('');
    setError('');
  };

  async function withPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (mode === 'enable') {
      const { data, error } = await authClient.twoFactor.enable({ password, method: 'totp' });
      if (error || !data || data.method !== 'totp') setError(errorText(error, 'Password is wrong.'));
      else setEnrol({ totpURI: data.totpURI, backupCodes: data.backupCodes, qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 192 }) });
    } else if (mode === 'disable') {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) setError(errorText(error, 'Password is wrong.'));
      else (await refresh(), reset());
    } else if (mode === 'codes') {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      if (error || !data) setError(errorText(error, 'Password is wrong.'));
      else (setCodes(data.backupCodes), reset());
    }
    setBusy(false);
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') });
    setBusy(false);
    if (error) return setError(errorText(error, 'That code is not valid. Check the time on your phone.'));
    setCodes(enrol!.backupCodes);
    reset();
    await refresh();
  }

  const secret = enrol ? new URL(enrol.totpURI).searchParams.get('secret') : null;

  return (
    <Card title="Two-step verification">
      <p>
        Status: {on ? <span className="tag ok">On</span> : <span className="tag">Off</span>}{' '}
        <span className="muted">After your password, you enter a code from an authenticator app (or an emailed code, or a backup code).</span>
      </p>

      {codes && (
        <div className="codes">
          <p>
            <b>Backup codes.</b> Each works once if you lose your phone. Store them somewhere safe; they won't be shown again.
          </p>
          <ul>
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button className="btn small" onClick={() => setCodes(null)}>
            I've saved them
          </button>
        </div>
      )}

      {mode === 'idle' && !codes && (
        <div className="row">
          {on ? (
            <>
              <button className="btn" onClick={() => setMode('codes')}>
                New backup codes
              </button>
              <button className="btn danger" onClick={() => setMode('disable')}>
                Turn off
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={() => setMode('enable')}>
              Turn on
            </button>
          )}
        </div>
      )}

      {mode !== 'idle' && !enrol && (
        <form className="form narrow" onSubmit={withPassword}>
          <Field label="Confirm with your password" type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorLine>{error}</ErrorLine>
          <div className="row">
            <button className={mode === 'disable' ? 'btn danger' : 'btn primary'} disabled={busy}>
              {mode === 'enable' ? 'Continue' : mode === 'disable' ? 'Turn off two-step verification' : 'Create new backup codes'}
            </button>
            <button type="button" className="btn" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {enrol && (
        <form className="form enrol" onSubmit={confirm}>
          <ol>
            <li>Scan this code with an authenticator app (Google Authenticator, 1Password, Authy…).</li>
          </ol>
          <img src={enrol.qr} width={192} height={192} alt="QR code for your authenticator app" />
          <p className="muted">
            Can't scan? Enter this key: <code>{secret}</code>
          </p>
          <ol start={2}>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <Field label="Code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          <ErrorLine>{error}</ErrorLine>
          <div className="row">
            <button className="btn primary" disabled={busy}>
              Turn on
            </button>
            <button type="button" className="btn" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (error) return setError(errorText(error, 'Current password is wrong.'));
    setCurrent('');
    setNext('');
    setMsg('Password changed. Other devices were signed out.');
  }

  return (
    <Card title="Password">
      <form className="form narrow" onSubmit={submit}>
        <Field label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field label="New password" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} hint="At least 10 characters." />
        <ErrorLine>{error}</ErrorLine>
        {msg && <p className="ok">{msg}</p>}
        <button className="btn" disabled={busy}>
          Change password
        </button>
      </form>
    </Card>
  );
}

/* ---------- Members ---------- */

interface FullOrg {
  name: string;
  members: { id: string; role: string; userId: string; user: { name: string; email: string } }[];
  invitations: { id: string; email: string; role: string; status: string; expiresAt: string }[];
}

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };
const ROLE_NAME: Record<Role, string> = { member: 'Member', admin: 'Admin', owner: 'Owner' };
const PLATFORM_NAME = { wordpress: 'WordPress', wix: 'Wix', php: 'PHP' } as const;

/** Highest role in Better Auth's role field (a comma-separated list). */
const topRole = (field: string): Role =>
  field
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is Role => r in RANK)
    .sort((a, b) => RANK[b] - RANK[a])[0] ?? 'member';

export function Members() {
  const { orgId = '' } = useParams();
  const { me, refresh } = useMe();
  const mine = me.orgs.find((o) => o.id === orgId);
  const canManage = mine ? RANK[mine.role] >= RANK.admin : false;
  const [org, setOrg] = useState<FullOrg | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState('');
  const [peopleError, setPeopleError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await authClient.organization.getFullOrganization({ query: { organizationId: orgId } });
    if (error || !data) setError(errorText(error, 'Could not load members.'));
    else setOrg(data as unknown as FullOrg);
  }, [orgId]);

  useEffect(() => {
    if (mine) void load();
  }, [mine, load]);

  if (!mine) {
    return (
      <SettingsShell title="Organisation">
        <p className="err">This organisation doesn't exist or you're not a member.</p>
      </SettingsShell>
    );
  }
  const isOwner = mine.role === 'owner';

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    const { error } = await authClient.organization.inviteMember({ email: email.trim(), role, organizationId: orgId });
    if (error) return setError(errorText(error));
    setMsg(`Invitation sent to ${email.trim()}.`);
    setEmail('');
    await load();
  }

  async function act(p: Promise<{ error: { message?: string; status?: number } | null }>, show = setError) {
    setError('');
    setPeopleError('');
    const { error } = await p;
    if (error) show(errorText(error));
    await load();
  }

  /** The server applies Better Auth's rules: only owners touch owners, and the last owner can't step down. */
  async function changeRole(m: FullOrg['members'][number], to: Role) {
    setBusy(m.id);
    await act(authClient.organization.updateMemberRole({ memberId: m.id, role: to, organizationId: orgId }), setPeopleError);
    if (m.userId === me.user.userId) await refresh(); // your own role changes what this page offers
    setBusy('');
  }

  const pending = org?.invitations.filter((i) => i.status === 'pending') ?? [];

  return (
    <SettingsShell title={mine.name} orgId={orgId}>
      <Card title="People">
        {!org ? (
          <p className="muted">Loading…</p>
        ) : (
          <table className="members">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {org.members.map((m) => {
                const self = m.userId === me.user.userId;
                const current = topRole(m.role);
                const editable = canManage && (current !== 'owner' || isOwner);
                const removable = editable && !self;
                return (
                  <tr key={m.id}>
                    <td>
                      {m.user.name} {self && <span className="muted">(you)</span>}
                    </td>
                    <td>{m.user.email}</td>
                    <td>
                      {editable ? (
                        <select
                          className="role-select"
                          aria-label={`Role of ${m.user.name || m.user.email}`}
                          value={current}
                          disabled={busy === m.id}
                          onChange={(e) => changeRole(m, e.target.value as Role)}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          {isOwner && <option value="owner">Owner</option>}
                        </select>
                      ) : (
                        ROLE_NAME[current]
                      )}
                    </td>
                    <td>
                      {removable && (
                        <button
                          className="lnk danger"
                          onClick={() => act(authClient.organization.removeMember({ memberIdOrEmail: m.id, organizationId: orgId }), setPeopleError)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <ErrorLine>{peopleError}</ErrorLine>
        <p className="muted">
          Members can view. Admins can also add websites, change settings and invite people. Owners can also delete websites and make
          others owners.
        </p>
      </Card>

      <Websites orgId={orgId} isOwner={isOwner} />

      {canManage && (
        <Card title="Invite someone">
          <form className="form inline" onSubmit={invite}>
            <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="field">
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="member">Member (view)</option>
                <option value="admin">Admin (manage)</option>
              </select>
            </label>
            <button className="btn primary">Send invitation</button>
          </form>
          <ErrorLine>{error}</ErrorLine>
          {msg && <p className="ok">{msg}</p>}
          {pending.length > 0 && (
            <>
              <h3>Pending invitations</h3>
              <ul className="plain">
                {pending.map((i) => (
                  <li key={i.id}>
                    {i.email} · {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}{' '}
                    <button className="lnk" onClick={() => act(authClient.organization.cancelInvitation({ invitationId: i.id }))}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
      {!canManage && <ErrorLine>{error}</ErrorLine>}
    </SettingsShell>
  );
}

/* ---------- Websites of an organisation ---------- */

function Websites({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const { me, refresh } = useMe();
  const sites = me.sites.filter((s) => s.orgId === orgId);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function open(siteId: string | null) {
    setConfirming(siteId);
    setTyped('');
    setError('');
    setMsg('');
  }

  async function remove(e: FormEvent, site: { id: string; name: string }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/api/sites/${encodeURIComponent(site.id)}`, { method: 'DELETE' });
      open(null);
      setMsg(`${site.name} was deleted.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'Only owners can delete a website.' : "Couldn't delete the website. Try again.");
    }
    setBusy(false);
  }

  return (
    <Card title="Websites">
      {sites.length === 0 ? (
        <p className="muted">No websites yet.</p>
      ) : (
        <ul className="plain site-list">
          {sites.map((s) => (
            <li key={s.id}>
              <div className="site-row">
                <Link to={`/s/${s.id}`}>{s.name}</Link>
                <span className="muted">{PLATFORM_NAME[s.platform]}</span>
                {isOwner && confirming !== s.id && (
                  <button className="lnk danger" onClick={() => open(s.id)}>
                    Delete…
                  </button>
                )}
              </div>
              {confirming === s.id && (
                <form className="form narrow danger-box" onSubmit={(e) => remove(e, s)}>
                  <p>
                    <b>Delete {s.name} and everything recorded for it:</b> visits, page views, clicks, requests and its settings. This can't
                    be undone, and the tracking code on the website stops sending data.
                  </p>
                  <Field
                    label="Type the website's name to confirm"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={s.name}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                  <ErrorLine>{error}</ErrorLine>
                  <div className="row">
                    <button className="btn danger" disabled={busy || typed.trim() !== s.name.trim()}>
                      Delete website
                    </button>
                    <button type="button" className="btn" onClick={() => open(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="ok">{msg}</p>}
      {!isOwner && sites.length > 0 && <p className="muted">Only owners can delete a website.</p>}
    </Card>
  );
}
