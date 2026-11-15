import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { api } from './client';

export function Logo() {
  return (
    <div className="logo">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <path d="M2 5h22l-7 8v8l-8 3v-11z" fill="none" stroke="#1C2826" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="13" cy="9" r="2" fill="#2B4FB3" />
      </svg>
      Website Dashboard
    </div>
  );
}

/** Centered card used by every sign-in screen. */
export function AuthCard({ title, lead, children, wide }: { title: string; lead?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth-wrap">
      <Logo />
      <section className={wide ? 'auth-card wide' : 'auth-card'} aria-label={title}>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </section>
    </div>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...input} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return children ? (
    <p className="err" role="alert">
      {children}
    </p>
  ) : null;
}

export function Divider({ children }: { children: ReactNode }) {
  return <div className="divider">{children}</div>;
}

/** Whether Google sign-in is configured on the server (GET /api/config). */
export function useGoogleEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    api<{ google: boolean }>('/api/config')
      .then((c) => setOn(c.google))
      .catch(() => setOn(false));
  }, []);
  return on;
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
