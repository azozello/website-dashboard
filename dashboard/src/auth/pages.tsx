import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { authClient, errorText, safeNext } from './client';
import { AuthCard, Divider, ErrorLine, Field, GoogleIcon, useGoogleEnabled } from './ui';

const withNext = (path: string, next: string) => (next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`);

/**
 * After a session is created: full page load into the app, so every component
 * (and the session hook) starts from the new cookie instead of racing its refetch.
 */
const finishSignIn = (next: string) => window.location.replace(next);

function GoogleButton({ next }: { next: string }) {
  const enabled = useGoogleEnabled();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        className="btn google"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: next, errorCallbackURL: '/login?error=google' });
          if (error) {
            setError(errorText(error));
            setBusy(false);
          }
        }}
      >
        <GoogleIcon /> Continue with Google
      </button>
      <ErrorLine>{error}</ErrorLine>
      <Divider>or with email</Divider>
    </>
  );
}

export function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(params.get('error') ? 'Google sign-in did not complete. Try again.' : '');
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setUnverified(false);
    const { data, error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) {
      if (error.status === 403) setUnverified(true);
      else setError(error.status === 401 ? 'Email or password is wrong.' : errorText(error));
      return;
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) navigate(withNext('/two-factor', next));
    else finishSignIn(next);
  }

  if (session) return <Navigate to={next} replace />; // already signed in

  return (
    <AuthCard title="Sign in">
      {params.get('reset') && <p className="ok">Password changed. Sign in with the new one.</p>}
      <GoogleButton next={next} />
      <form onSubmit={submit} className="form">
        <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorLine>{error}</ErrorLine>
        {unverified && <ResendVerification email={email} next={next} lead="Confirm your email address first." />}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="links">
        <Link to="/forgot-password">Forgot password?</Link>
        <span>
          New here? <Link to={withNext('/signup', next)}>Create an account</Link>
        </span>
      </p>
    </AuthCard>
  );
}

function ResendVerification({ email, next, lead }: { email: string; next: string; lead?: string }) {
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  return (
    <p className="hint-line">
      {lead}{' '}
      {state === 'sent' ? (
        'We sent a new link.'
      ) : (
        <button
          type="button"
          className="lnk"
          onClick={async () => {
            const { error } = await authClient.sendVerificationEmail({ email, callbackURL: next });
            setState(error ? 'error' : 'sent');
          }}
        >
          Send the link again
        </button>
      )}
      {state === 'error' && ' Could not send it. Try again in a minute.'}
    </p>
  );
}

export function Signup() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await authClient.signUp.email({ name, email, password, callbackURL: next });
    setBusy(false);
    if (error) return setError(errorText(error));
    navigate(`/check-email?email=${encodeURIComponent(email)}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`);
  }

  return (
    <AuthCard title="Create your account">
      <GoogleButton next={next} />
      <form onSubmit={submit} className="form">
        <Field label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 10 characters."
        />
        <ErrorLine>{error}</ErrorLine>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="links">
        <span>
          Have an account? <Link to={withNext('/login', next)}>Sign in</Link>
        </span>
      </p>
    </AuthCard>
  );
}

export function CheckEmail() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  return (
    <AuthCard title="Check your email" lead={<>We sent a confirmation link to <b>{email || 'your address'}</b>. Open it to finish signing up. It is valid for 1 hour.</>}>
      {email && <ResendVerification email={email} next={safeNext(params.get('next'))} lead="Nothing arrived?" />}
      <p className="links">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setBusy(false);
    if (error) setError(errorText(error));
    else setSent(true);
  }

  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <p className="ok">If an account exists for {email}, we sent a reset link. It is valid for 1 hour.</p>
      ) : (
        <form onSubmit={submit} className="form">
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorLine>{error}</ErrorLine>
          <button className="btn primary" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}
      <p className="links">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(params.get('error') ? 'This link is invalid or has expired. Ask for a new one.' : '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) setError(errorText(error, 'This link is invalid or has expired. Ask for a new one.'));
    else navigate('/login?reset=1', { replace: true });
  }

  return (
    <AuthCard title="Choose a new password" lead="Signing in with the new password signs you out everywhere else.">
      {token && !params.get('error') ? (
        <form onSubmit={submit} className="form">
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 10 characters."
          />
          <ErrorLine>{error}</ErrorLine>
          <button className="btn primary" disabled={busy}>
            Save password
          </button>
        </form>
      ) : (
        <ErrorLine>{error || 'This link is incomplete. Ask for a new one.'}</ErrorLine>
      )}
      <p className="links">
        <Link to="/forgot-password">Ask for a new link</Link>
      </p>
    </AuthCard>
  );
}

type Method = 'totp' | 'otp' | 'backup';

/** Second step after a correct password, for users with MFA on. */
export function TwoFactor() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [method, setMethod] = useState<Method>('totp');
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (m: Method) => {
    setMethod(m);
    setCode('');
    setError('');
  };

  async function sendOtp() {
    setBusy(true);
    setError('');
    const { error } = await authClient.twoFactor.sendOtp({ trustDevice: trust });
    setBusy(false);
    if (error) setError(error.status === 401 ? 'Your sign-in expired. Start again.' : errorText(error));
    else setOtpSent(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const clean = method === 'backup' ? code.trim() : code.replace(/\s/g, '');
    const { error } =
      method === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code: clean, trustDevice: trust })
        : method === 'otp'
          ? await authClient.twoFactor.verifyOtp({ code: clean, trustDevice: trust })
          : await authClient.twoFactor.verifyBackupCode({ code: clean, trustDevice: trust });
    setBusy(false);
    if (error) {
      setError(error.status === 401 && /expired|session/i.test(error.message ?? '') ? 'Your sign-in expired. Start again.' : errorText(error, 'That code is not valid.'));
      return;
    }
    finishSignIn(next);
  }

  const label = { totp: 'Code from your authenticator app', otp: 'Code from the email', backup: 'Backup code' }[method];

  return (
    <AuthCard title="Two-step verification" lead="Enter a code to finish signing in.">
      <div className="method-tabs" role="tablist" aria-label="Verification method">
        {(
          [
            ['totp', 'Authenticator app'],
            ['otp', 'Email code'],
            ['backup', 'Backup code'],
          ] as [Method, string][]
        ).map(([m, text]) => (
          <button key={m} role="tab" type="button" aria-selected={method === m} onClick={() => pick(m)}>
            {text}
          </button>
        ))}
      </div>
      {method === 'otp' && !otpSent ? (
        <div className="form">
          <p className="hint-line">We'll email you a 6-digit code, valid for 5 minutes.</p>
          <ErrorLine>{error}</ErrorLine>
          <button type="button" className="btn primary" disabled={busy} onClick={sendOtp}>
            Email me a code
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="form">
          <Field
            label={label}
            inputMode={method === 'backup' ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <label className="check">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} /> Trust this device for 30 days
          </label>
          <ErrorLine>{error}</ErrorLine>
          <button className="btn primary" disabled={busy}>
            Verify
          </button>
          {method === 'otp' && (
            <button type="button" className="lnk" onClick={sendOtp} disabled={busy}>
              Send another code
            </button>
          )}
        </form>
      )}
      <p className="links">
        <Link to="/login">Start again</Link>
      </p>
    </AuthCard>
  );
}

interface InvitationView {
  organizationName: string;
  inviterEmail: string;
  role: string;
  email: string;
}

/** /invite/:id — works signed out (asks to sign in first) and signed in (accept or decline). */
export function Invite() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [inv, setInv] = useState<InvitationView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const here = `/invite/${encodeURIComponent(id)}`;

  useEffect(() => {
    if (!session) return;
    authClient.organization.getInvitation({ query: { id } }).then(({ data, error }) => {
      if (error || !data) setError(error?.status === 403 ? `This invitation was sent to a different email address than ${session.user.email}.` : 'This invitation is invalid, used or expired.');
      else setInv(data as unknown as InvitationView);
    });
  }, [session, id]);

  if (isPending) return null;
  if (!session) {
    return (
      <AuthCard title="You're invited" lead="Sign in or create an account with the email address the invitation was sent to.">
        <div className="form">
          <Link className="btn primary" to={withNext('/login', here)}>
            Sign in
          </Link>
          <Link className="btn" to={withNext('/signup', here)}>
            Create an account
          </Link>
        </div>
      </AuthCard>
    );
  }

  async function respond(accept: boolean) {
    setBusy(true);
    const { error } = accept
      ? await authClient.organization.acceptInvitation({ invitationId: id })
      : await authClient.organization.rejectInvitation({ invitationId: id });
    setBusy(false);
    if (error) return setError(errorText(error));
    window.location.assign('/'); // reload: the site list changed
  }

  return (
    <AuthCard title="You're invited">
      {inv ? (
        <>
          <p className="lead">
            {inv.inviterEmail} invited you to <b>{inv.organizationName}</b> as <b>{inv.role}</b>.
          </p>
          <ErrorLine>{error}</ErrorLine>
          <div className="form">
            <button className="btn primary" disabled={busy} onClick={() => respond(true)}>
              Accept and open the dashboard
            </button>
            <button className="btn" disabled={busy} onClick={() => respond(false)}>
              Decline
            </button>
          </div>
        </>
      ) : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {!error && <p className="muted">Loading invitation…</p>}
          <p className="links">
            <button className="lnk" onClick={() => navigate('/')}>
              Go to your dashboard
            </button>
            <button
              className="lnk"
              onClick={async () => {
                await authClient.signOut();
                navigate(withNext('/login', here));
              }}
            >
              Use another account
            </button>
          </p>
        </>
      )}
    </AuthCard>
  );
}
