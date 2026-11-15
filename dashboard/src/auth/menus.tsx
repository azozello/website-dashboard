import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from './client';
import { rememberSite, useMe } from './session';

/** Dropdown that closes on outside click and Escape. */
function Menu({ button, label, children, align = 'left', className = '' }: { button: ReactNode; label: string; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={`menu-wrap ${className}`} ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{button}</div>
      {open && (
        <div className={`menu ${align}`} role="menu" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Top-bar website picker: only the sites /api/me returned, grouped by organisation. */
export function SiteSwitcher({ siteId }: { siteId?: string }) {
  const { me } = useMe();
  const navigate = useNavigate();
  const current = me.sites.find((s) => s.id === siteId);
  const canAdd = me.orgs.some((o) => o.role === 'owner' || o.role === 'admin');
  const groups = me.orgs.map((o) => ({ org: o, sites: me.sites.filter((s) => s.orgId === o.id) })).filter((g) => g.sites.length);

  return (
    <Menu
      label="Websites"
      className="site-menu"
      button={
        <button className="site" aria-label="Switch website" aria-haspopup="menu">
          <span className="fav" aria-hidden="true">
            {(current?.name ?? '?').charAt(0).toUpperCase()}
          </span>
          <span>
            <small>{current?.orgName ?? 'Website'}</small>
            <b>{current?.name ?? 'Choose a website'}</b>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A6764" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      }
    >
      {(close) => (
        <>
          {groups.map(({ org, sites }) => (
            <div key={org.id}>
              <div className="menu-label">{org.name}</div>
              {sites.map((s) => (
                <button
                  key={s.id}
                  role="menuitemradio"
                  aria-checked={s.id === siteId}
                  onClick={() => {
                    close();
                    rememberSite(s.id);
                    navigate(`/s/${s.id}`);
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ))}
          {canAdd && (
            <>
              <div className="menu-sep" />
              <button role="menuitem" onClick={() => (close(), navigate('/onboarding'))}>
                + Add website
              </button>
            </>
          )}
        </>
      )}
    </Menu>
  );
}

/** Account menu: security settings, members of the current organisation, sign out. */
export function UserMenu({ orgId }: { orgId?: string }) {
  const { me } = useMe();
  const navigate = useNavigate();
  const org = me.orgs.find((o) => o.id === orgId) ?? me.orgs[0];
  const initial = (me.user.name || me.user.email).charAt(0).toUpperCase();
  return (
    <Menu
      label="Account"
      className="user-menu"
      align="right"
      button={
        <button className="avatar" aria-label="Account" aria-haspopup="menu">
          {initial}
        </button>
      }
    >
      {(close) => (
        <>
          <div className="menu-head">
            <b>{me.user.name}</b>
            <small>{me.user.email}</small>
          </div>
          <Link role="menuitem" to="/settings/security" onClick={close}>
            Sign-in &amp; security
          </Link>
          {org && (
            <Link role="menuitem" to={`/orgs/${org.id}/members`} onClick={close}>
              {org.name}: members &amp; websites
            </Link>
          )}
          <div className="menu-sep" />
          <button
            role="menuitem"
            onClick={async () => {
              close();
              await authClient.signOut();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </button>
        </>
      )}
    </Menu>
  );
}
