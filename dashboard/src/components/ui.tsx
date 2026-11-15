import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Page, Tone } from '../mock/data';
import { change, cssVars, TONE } from '../lib/format';
import type { Flag } from '../lib/analysis';

export const pagePath = (p: Page) => `/pages/${p.slug}`;

export function Panel({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="panel" id={id} aria-label={title}>
      <div className="panel-h">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Head({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="head">
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}

/** "+5%" / "−0.3 pts" coloured by direction. */
export function Change({ cur, prev, rate }: { cur: number; prev: number; rate?: boolean }) {
  const c = change(cur, prev, rate);
  return <span className={c.cls}>{c.text}</span>;
}

/** Value followed by a small horizontal bar. */
export function Bar({ v, max, color, children }: { v: number; max: number; color: string; children: ReactNode }) {
  const w = Math.max(4, Math.min(100, (v / (max || 1)) * 100));
  return (
    <span className="bar">
      {children}
      <s style={cssVars({ '--c': color })}>
        <u style={{ width: w.toFixed(1) + '%' }} />
      </s>
    </span>
  );
}

/** Finding with a coloured dot. */
export function Dx({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="dx" style={cssVars({ '--c': TONE[tone] })}>
      {children}
    </span>
  );
}

export function PageLink({ page }: { page: Page }) {
  const navigate = useNavigate();
  return (
    <button className="lnk" onClick={() => navigate(pagePath(page))}>
      {page.name}
    </button>
  );
}

export interface VRow {
  label: ReactNode;
  el?: boolean;
  v: number;
  text: string;
  c: string;
}

/** Labelled horizontal bars (scroll reach, time buckets, funnels). */
export function VRows({ rows }: { rows: VRow[] }) {
  return (
    <div className="rows">
      {rows.map((r, i) => (
        <div key={i} className={'vrow' + (r.el ? ' el' : '')}>
          <span>{r.label}</span>
          <div className="ctrack">
            <div style={{ width: Math.max(1, r.v * 100).toFixed(1) + '%', background: r.c }} />
          </div>
          <span className="n">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Muted({ children, faint }: { children: ReactNode; faint?: boolean }) {
  return <small style={faint ? { color: 'var(--faint)', fontWeight: 400 } : { color: 'var(--muted)' }}>{children}</small>;
}

/** Legend for the numbered change markers under a chart. */
export function ChangesLine({ flags }: { flags: Flag[] }) {
  return (
    <div className="changes-line">
      {flags.length ? (
        flags.map((f) => (
          <span key={f.num}>
            <b>{f.num}</b>
            {f.title}, {f.date}
          </span>
        ))
      ) : (
        <span>No changes in this period.</span>
      )}
    </div>
  );
}
