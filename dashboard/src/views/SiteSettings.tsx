/**
 * Website settings: name and allowed addresses (sites), sections, booking paths and request
 * rules (site_config, served to r1.js and used by ingest). One draft across the three tabs and
 * one save bar; owners and admins edit, members see the same screens read-only.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../auth/client';
import { useMe } from '../auth/session';
import { sitePath, useSiteId } from '../site';
import './settings.css';
import { SearchConsoleTab } from './SearchConsole';
import { PLATFORM_NAME, toOrigin, validSelector, type DetectedForm, type Method, type Rule, type SiteConfig, type SiteDetails } from './siteApi';

const TABS: [string, string][] = [
  ['', 'Website'],
  ['tracking', 'Sections & booking'],
  ['requests', 'Request rules'],
  ['search-console', 'Search Console'],
];

const tabOf = (field: string) => (/^(sections|bookingPaths|spa)/.test(field) ? 'tracking' : field.startsWith('requestRules') ? 'requests' : '');

interface Draft {
  name: string;
  origins: string[];
  config: SiteConfig;
}

const draftOf = (site: SiteDetails, config: SiteConfig): Draft => ({ name: site.name, origins: [...site.allowedOrigins], config: structuredClone(config) });
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SiteSettings() {
  const siteId = useSiteId();
  const tab = useParams()['*'] ?? '';
  const navigate = useNavigate();
  const { me, refresh } = useMe();
  const role = me.sites.find((s) => s.id === siteId)?.role;
  const canEdit = role === 'owner' || role === 'admin';

  const [site, setSite] = useState<SiteDetails | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [detected, setDetected] = useState<DetectedForm[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string; reload?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api<SiteDetails>(`/api/sites/${siteId}`), api<{ config: SiteConfig; detectedForms: DetectedForm[] }>(`/api/sites/${siteId}/config`)]);
      setSite(s);
      setConfig(c.config);
      setDetected(c.detectedForms);
      setDraft(draftOf(s, c.config));
      setErrors({});
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [siteId]);

  useEffect(() => {
    setDraft(null);
    setBanner(null);
    void load();
  }, [load]);

  const generalDirty = !!(site && draft) && (draft.name !== site.name || !sameJson(draft.origins, site.allowedOrigins));
  const configDirty = !!(config && draft) && !sameJson(draft.config, config);
  const dirty = generalDirty || configDirty;

  // Closing the tab or reloading with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (fn: (d: Draft) => void) => {
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });
    setBanner((b) => (b?.kind === 'ok' ? null : b));
  };

  const fail = (field: string, message: string) => {
    setErrors({ [field]: message });
    setBanner({ kind: 'err', text: message });
    if (tabOf(field) !== tab) navigate(sitePath(siteId, `/settings${tabOf(field) ? '/' + tabOf(field) : ''}`));
  };

  /** Client-side checks the API can't do (CSS syntax) or can't pinpoint (which address is wrong). */
  function precheck(d: Draft): [string, string] | null {
    if (!d.name.trim()) return ['name', 'Enter a name for the website.'];
    if (!d.origins.length) return ['origins', 'Add at least one address.'];
    const bad = d.origins.findIndex((o) => !toOrigin(o));
    if (bad >= 0) return [`origins[${bad}]`, 'Enter an address like https://www.example.com'];
    for (const [i, s] of d.config.sections.entries()) if (!validSelector(s.selector)) return [`sections[${i}].selector`, 'This is not a valid CSS selector.'];
    for (const [i, r] of d.config.requestRules.entries())
      for (const k of ['selector', 'successSelector'] as const) if (r[k] && !validSelector(r[k]!)) return [`requestRules[${i}].${k}`, 'This is not a valid CSS selector.'];
    return null;
  }

  async function save() {
    if (!draft || !site || !config) return;
    setErrors({});
    setBanner(null);
    const pre = precheck(draft);
    if (pre) return fail(...pre);
    setBusy(true);
    try {
      if (generalDirty) {
        const origins = [...new Set(draft.origins.map((o) => toOrigin(o)!))];
        await api(`/api/sites/${siteId}`, { method: 'PATCH', body: { name: draft.name.trim(), origins } });
        const s = { ...site, name: draft.name.trim(), allowedOrigins: origins };
        setSite(s);
        setDraft((d) => d && { ...d, name: s.name, origins });
        if (s.name !== site.name) void refresh();
      }
      if (configDirty) {
        const { version, spa, sections, bookingPaths, requestRules } = draft.config;
        const r = await api<{ config: SiteConfig }>(`/api/sites/${siteId}/config`, { method: 'PUT', body: { version, spa, sections, bookingPaths, requestRules } });
        setConfig(r.config);
        setDraft((d) => d && { ...d, config: structuredClone(r.config) });
      }
      setBanner({ kind: 'ok', text: configDirty ? 'Saved. Your website picks up the changes within about 5 minutes.' : 'Saved.' });
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { error?: string; field?: string; message?: string } | null) : null;
      if (body?.field && body.message) fail(body.field, body.message);
      else if (err instanceof ApiError && err.status === 409) setBanner({ kind: 'err', text: body?.message ?? 'Someone else changed these settings.', reload: true });
      else if (err instanceof ApiError && err.status === 403) setBanner({ kind: 'err', text: 'Only owners and admins can change settings.' });
      else if (body?.error === 'invalid_origin') fail('origins', 'One of the addresses is not valid.');
      else setBanner({ kind: 'err', text: 'Could not save. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed)
    return (
      <div className="head">
        <h1>Settings</h1>
        <p className="err">Couldn't load the settings. Reload the page to try again.</p>
      </div>
    );
  if (!draft || !site || !config) return <p className="muted">Loading…</p>;

  const ctx: EditorProps = { draft, edit, errors, canEdit, platform: site.platform };
  return (
    <div className="set-page">
      <div className="head">
        <h1>Settings</h1>
        <p>
          {PLATFORM_NAME[site.platform]} website{config.updatedAt ? ` · tracking settings version ${config.version}` : ''}.
          {!canEdit && ' Only owners and admins can change these settings.'}
        </p>
      </div>

      <div className="tabs set-tabs" role="tablist" aria-label="Settings">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => navigate(sitePath(siteId, `/settings${t ? '/' + t : ''}`))}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'search-console' ? (
        // Takes effect at once (connect, choose, disconnect); not part of the draft below.
        <SearchConsoleTab siteId={siteId} canEdit={canEdit} />
      ) : (
        <fieldset className={`set-fields${canEdit ? '' : ' readonly'}`} disabled={!canEdit || busy}>
          {tab === 'tracking' ? <TrackingTab {...ctx} /> : tab === 'requests' ? <RulesTab {...ctx} detected={detected} /> : <WebsiteTab {...ctx} site={site} />}
        </fieldset>
      )}

      {(dirty || banner) && (
        <div className={`savebar${dirty ? ' dirty' : ''}`} role="region" aria-label="Save changes">
          {banner ? (
            <p className={banner.kind} role={banner.kind === 'err' ? 'alert' : 'status'}>
              {banner.text}
            </p>
          ) : (
            <p>You have unsaved changes{generalDirty && configDirty ? ' on more than one tab' : ''}.</p>
          )}
          <div className="row">
            {banner?.reload && (
              <button className="btn" onClick={() => void load().then(() => setBanner(null))}>
                Reload
              </button>
            )}
            {dirty && (
              <>
                <button className="btn" disabled={busy} onClick={() => (setDraft(draftOf(site, config)), setErrors({}), setBanner(null))}>
                  Discard
                </button>
                <button className="btn primary" disabled={busy || !canEdit} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- shared bits ---------- */

interface EditorProps {
  draft: Draft;
  edit: (fn: (d: Draft) => void) => void;
  errors: Record<string, string>;
  canEdit: boolean;
  platform: SiteDetails['platform'];
}

function Card({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel set-card" aria-label={title}>
      <h2>{title}</h2>
      {lead && <p className="muted">{lead}</p>}
      {children}
    </section>
  );
}

/** Text input with its label and the API's error for `field`. */
function Input({
  label,
  field,
  errors,
  value,
  onChange,
  hideLabel,
  ...rest
}: {
  label: string;
  field: string;
  errors: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
  hideLabel?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  list?: string;
  spellCheck?: boolean;
}) {
  const err = errors[field];
  return (
    <label className={`field ${rest.className ?? ''}`}>
      <span className={hideLabel ? 'sr' : undefined}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={err ? true : undefined} placeholder={rest.placeholder} maxLength={rest.maxLength} list={rest.list} spellCheck={rest.spellCheck} />
      {err ? <small className="field-err">{err}</small> : rest.hint && <small>{rest.hint}</small>}
    </label>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function AddButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn small add-btn" onClick={onClick} disabled={disabled}>
      + {children}
    </button>
  );
}

/* ---------- Website: name, allowed addresses ---------- */

function WebsiteTab({ draft, edit, errors, site }: EditorProps & { site: SiteDetails }) {
  return (
    <>
      <Card title="Name">
        <Input label="Website name" field="name" errors={errors} value={draft.name} maxLength={120} onChange={(v) => edit((d) => void (d.name = v))} className="narrow-field" />
      </Card>

      <Card
        title="Allowed addresses"
        lead="Page views are accepted only from these addresses. Add every address visitors use, for example with and without www. Up to 10."
      >
        <ul className="set-list">
          {draft.origins.map((o, i) => {
            const norm = toOrigin(o);
            return (
              <li key={i} className="set-row">
                <Input
                  label={`Address ${i + 1}`}
                  hideLabel
                  field={`origins[${i}]`}
                  errors={errors}
                  value={o}
                  placeholder="https://www.example.com"
                  spellCheck={false}
                  hint={norm && norm !== o.trim() ? `Saved as ${norm}` : undefined}
                  onChange={(v) => edit((d) => void (d.origins[i] = v))}
                />
                {draft.origins.length > 1 && <RemoveButton label={`Remove ${o || 'address'}`} onClick={() => edit((d) => void d.origins.splice(i, 1))} />}
              </li>
            );
          })}
        </ul>
        {errors.origins && <small className="field-err">{errors.origins}</small>}
        <div>
          <AddButton disabled={draft.origins.length >= 10} onClick={() => edit((d) => void d.origins.push(''))}>
            Add address
          </AddButton>
        </div>
      </Card>

      <Card title="Install details">
        <dl className="set-facts">
          <dt>Built with</dt>
          <dd>{PLATFORM_NAME[site.platform]}</dd>
          <dt>Site key</dt>
          <dd>
            <code>{site.siteKey}</code>
          </dd>
          <dt>Time zone</dt>
          <dd>{site.timezone}</dd>
        </dl>
        <p className="muted">The script tag and the remaining setup steps are on the setup checklist.</p>
      </Card>
    </>
  );
}

/* ---------- Sections, booking paths, page changes ---------- */

function TrackingTab({ draft, edit, errors }: EditorProps) {
  const { sections, bookingPaths, spa } = draft.config;
  return (
    <>
      <Card
        title="Sections"
        lead={
          <>
            A section counts as seen when it is on screen during a page view (e.g. prices, team, FAQ). Elements marked{' '}
            <code>data-r1-section="name"</code> in the page are picked up without a rule here.
          </>
        }
      >
        {sections.length > 0 && (
          <div className="set-grid sections" role="table" aria-label="Sections">
            <div className="set-grid-h" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">CSS selector</span>
              <span role="columnheader">Page (optional)</span>
              <span />
            </div>
            {sections.map((s, i) => (
              <div key={i} className="set-grid-r" role="row">
                <Input label="Name" field={`sections[${i}].name`} errors={errors} value={s.name} maxLength={60} placeholder="prices" onChange={(v) => edit((d) => void (d.config.sections[i].name = v))} />
                <Input
                  label="CSS selector"
                  field={`sections[${i}].selector`}
                  errors={selectorErrors(errors, `sections[${i}].selector`, s.selector)}
                  value={s.selector}
                  maxLength={300}
                  placeholder="#prices"
                  spellCheck={false}
                  onChange={(v) => edit((d) => void (d.config.sections[i].selector = v))}
                />
                <Input
                  label="Page (optional)"
                  field={`sections[${i}].path`}
                  errors={errors}
                  value={s.path ?? ''}
                  placeholder="All pages"
                  spellCheck={false}
                  onChange={(v) =>
                    edit((d) => {
                      if (v) d.config.sections[i].path = v;
                      else delete d.config.sections[i].path;
                    })
                  }
                />
                <RemoveButton label={`Remove section ${s.name || i + 1}`} onClick={() => edit((d) => void d.config.sections.splice(i, 1))} />
              </div>
            ))}
          </div>
        )}
        <div>
          <AddButton disabled={sections.length >= 50} onClick={() => edit((d) => void d.config.sections.push({ name: '', selector: '' }))}>
            Add section
          </AddButton>
        </div>
      </Card>

      <Card title="Booking pages" lead="Clicks on links to these pages, or to pages under them, count as booking clicks. Enter a path like /booking or paste a full link.">
        <ul className="set-list">
          {bookingPaths.map((p, i) => (
            <li key={i} className="set-row">
              <Input label={`Booking page ${i + 1}`} hideLabel field={`bookingPaths[${i}]`} errors={errors} value={p} placeholder="/booking" spellCheck={false} onChange={(v) => edit((d) => void (d.config.bookingPaths[i] = v))} />
              <RemoveButton label={`Remove ${p || 'booking page'}`} onClick={() => edit((d) => void d.config.bookingPaths.splice(i, 1))} />
            </li>
          ))}
        </ul>
        <div>
          <AddButton disabled={bookingPaths.length >= 20} onClick={() => edit((d) => void d.config.bookingPaths.push(''))}>
            Add booking page
          </AddButton>
        </div>
      </Card>

      <Card title="Page changes without reload" lead="For sites that switch pages without loading a new one (single-page apps). Leave on Automatic unless page views are counted twice.">
        <div className="set-radios" role="radiogroup" aria-label="Page changes without reload">
          {(
            [
              ['auto', 'Automatic', 'Each in-page route change counts as a page view.'],
              ['off', 'Off', 'Only full page loads count.'],
            ] as const
          ).map(([v, label, hint]) => (
            <label key={v} className="set-radio">
              <input type="radio" name="spa" checked={spa === v} onChange={() => edit((d) => void (d.config.spa = v))} />
              <span>
                <b>{label}</b>
                <small className="muted">{hint}</small>
              </span>
            </label>
          ))}
        </div>
      </Card>
    </>
  );
}

/** Live CSS-syntax feedback on top of the saved errors. */
function selectorErrors(errors: Record<string, string>, field: string, value: string) {
  return errors[field] || validSelector(value) ? errors : { ...errors, [field]: 'This is not a valid CSS selector.' };
}

/* ---------- Request rules ---------- */

const METHOD_NAME: Record<Method, string> = {
  server: 'Server (plugin or PHP)',
  webhook: 'Wix webhook',
  browser: 'Browser',
  thankyou: 'Thank-you page',
};
const SOURCES: [string, string][] = [
  ['cf7', 'Contact Form 7'],
  ['elementor', 'Elementor'],
  ['wpforms', 'WPForms'],
  ['gravity', 'Gravity Forms'],
  ['custom', 'PHP helper'],
];
const defaultMethod = (p: SiteDetails['platform']): Method => (p === 'wix' ? 'browser' : 'server');

function RulesTab({ draft, edit, errors, platform, detected }: EditorProps & { detected: DetectedForm[] }) {
  const rules = draft.config.requestRules;
  const hasPrimary = (form: string, except = -1) => rules.some((r, i) => i !== except && r.counts && r.form.trim() === form.trim());
  const forms = useMemo(() => [...new Set(rules.map((r) => r.form.trim()).filter(Boolean))], [rules]);
  const missing = detected.filter((f) => !rules.some((r) => r.method === 'server' && r.source === f.source && r.formId === f.id));

  const setCounts = (i: number, counts: boolean) =>
    edit((d) => {
      const rs = d.config.requestRules;
      rs[i].counts = counts;
      // One primary per form: choosing one makes the form's other rules comparisons.
      if (counts) rs.forEach((r, j) => j !== i && r.form.trim() === rs[i].form.trim() && (r.counts = false));
    });

  const remove = (i: number) =>
    edit((d) => {
      const rs = d.config.requestRules;
      const [gone] = rs.splice(i, 1);
      // Removing the primary promotes the form's next rule, so the form keeps counting.
      if (gone.counts) {
        const next = rs.find((r) => r.form.trim() === gone.form.trim());
        if (next) next.counts = true;
      }
    });

  const setForm = (i: number, form: string) =>
    edit((d) => {
      const rs = d.config.requestRules;
      rs[i].form = form;
      // Joining a form that already has a primary makes this rule a comparison.
      if (rs[i].counts && rs.some((r, j) => j !== i && r.counts && r.form.trim() === form.trim())) rs[i].counts = false;
    });

  const add = (rule: Omit<Rule, 'counts'>) => edit((d) => void d.config.requestRules.push({ ...rule, counts: !hasPrimary(rule.form) }));

  return (
    <>
      <Card
        title="Request rules"
        lead={
          <>
            Which confirmations count as a request. Each form has one method that <b>counts</b>; other methods for the same form are recorded for{' '}
            <b>comparison</b> only. Without a rule, server and Wix webhook requests count, while browser and thank-you page requests need a rule.
          </>
        }
      >
        <datalist id="rule-forms">
          {forms.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        {rules.length === 0 && <p className="set-empty">No rules yet. Requests count by the defaults above.</p>}
        <ol className="rules">
          {rules.map((r, i) => (
            <RuleCard key={i} i={i} rule={r} errors={errors} edit={edit} onForm={(f) => setForm(i, f)} onCounts={(c) => setCounts(i, c)} onRemove={() => remove(i)} />
          ))}
        </ol>
        <div>
          <AddButton disabled={rules.length >= 50} onClick={() => add(blankRule(defaultMethod(platform)))}>
            Add rule
          </AddButton>
        </div>
      </Card>

      {platform === 'wordpress' && (
        <Card title="Forms on your WordPress site" lead="Reported by the Rate 1 Connector plugin. Add a rule to give a form a readable name or to compare methods.">
          {detected.length === 0 ? (
            <p className="set-empty">The plugin hasn't reported any forms yet.</p>
          ) : missing.length === 0 ? (
            <p className="set-empty">Every reported form has a rule.</p>
          ) : (
            <ul className="set-list">
              {missing.map((f) => (
                <li key={`${f.source}:${f.id}`} className="set-row detected">
                  <span>
                    <b>{f.title || `Form ${f.id}`}</b>
                    <small className="muted">
                      {SOURCES.find(([s]) => s === f.source)?.[1] ?? f.source} · ID {f.id}
                    </small>
                  </span>
                  <AddButton onClick={() => add({ method: 'server', form: f.title || `${f.source} ${f.id}`, source: f.source, formId: f.id })}>Add rule</AddButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

function blankRule(method: Method): Omit<Rule, 'counts'> {
  if (method === 'server') return { method, form: '', source: 'cf7', formId: '' };
  if (method === 'thankyou') return { method, form: '', path: '' };
  if (method === 'browser') return { method, form: '', selector: '', successSelector: '' };
  return { method, form: '' };
}

function RuleCard({
  i,
  rule,
  errors,
  edit,
  onForm,
  onCounts,
  onRemove,
}: {
  i: number;
  rule: Rule;
  errors: Record<string, string>;
  edit: EditorProps['edit'];
  onForm: (form: string) => void;
  onCounts: (counts: boolean) => void;
  onRemove: () => void;
}) {
  const at = `requestRules[${i}]`;
  const set = (patch: Partial<Rule>) => edit((d) => void Object.assign(d.config.requestRules[i], patch));
  const sourceKnown = SOURCES.some(([s]) => s === rule.source);
  const selErrors = selectorErrors(selectorErrors(errors, `${at}.selector`, rule.selector ?? ''), `${at}.successSelector`, rule.successSelector ?? '');
  return (
    <li className={`rule${errors[at] ? ' invalid' : ''}`} aria-label={`Rule ${i + 1}`}>
      <div className="rule-top">
        <Input label="Form" field={`${at}.form`} errors={errors} value={rule.form} maxLength={100} list="rule-forms" placeholder="Contact" onChange={onForm} />
        <label className="field">
          <span>Confirmed by</span>
          <select
            value={rule.method}
            onChange={(e) =>
              edit((d) => {
                const m = e.target.value as Method;
                d.config.requestRules[i] = { ...blankRule(m), form: d.config.requestRules[i].form, counts: d.config.requestRules[i].counts };
              })
            }
          >
            {(Object.keys(METHOD_NAME) as Method[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_NAME[m]}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span id={`counts-${i}`}>Role</span>
          <div className="seg" role="group" aria-labelledby={`counts-${i}`}>
            <button type="button" aria-pressed={rule.counts} onClick={() => onCounts(true)}>
              Counts
            </button>
            <button type="button" aria-pressed={!rule.counts} onClick={() => onCounts(false)}>
              Comparison
            </button>
          </div>
          {errors[`${at}.counts`] && <small className="field-err">{errors[`${at}.counts`]}</small>}
        </div>
        <RemoveButton label={`Remove rule ${i + 1}`} onClick={onRemove} />
      </div>

      <div className="rule-match">
        {rule.method === 'server' && (
          <>
            <label className="field">
              <span>Sent by</span>
              <select value={rule.source} onChange={(e) => set({ source: e.target.value })}>
                {!sourceKnown && <option value={rule.source}>{rule.source || 'Choose…'}</option>}
                {SOURCES.map(([s, name]) => (
                  <option key={s} value={s}>
                    {name}
                  </option>
                ))}
              </select>
              {errors[`${at}.source`] && <small className="field-err">{errors[`${at}.source`]}</small>}
            </label>
            <Input label="Form ID" field={`${at}.formId`} errors={errors} value={rule.formId ?? ''} maxLength={100} placeholder="12" spellCheck={false} onChange={(v) => set({ formId: v })} />
          </>
        )}
        {rule.method === 'thankyou' && (
          <Input label="Thank-you page" field={`${at}.path`} errors={errors} value={rule.path ?? ''} placeholder="/thank-you" spellCheck={false} onChange={(v) => set({ path: v })} />
        )}
        {rule.method === 'browser' && (
          <>
            <Input label="Form selector" field={`${at}.selector`} errors={selErrors} value={rule.selector ?? ''} maxLength={300} placeholder="form#contact" spellCheck={false} onChange={(v) => set({ selector: v })} />
            <Input
              label="Shown after success"
              field={`${at}.successSelector`}
              errors={selErrors}
              value={rule.successSelector ?? ''}
              maxLength={300}
              placeholder=".form-success"
              spellCheck={false}
              onChange={(v) => set({ successSelector: v })}
            />
          </>
        )}
      </div>
      <p className="rule-hint muted">
        {rule.method === 'server' && 'Matches requests the plugin or PHP helper sends for this form ID.'}
        {rule.method === 'thankyou' && 'Counts a visit that reaches this page, credited to the page before it. At most once per visit.'}
        {rule.method === 'webhook' && 'Matches the form name Wix sends to the webhook, exactly as written above.'}
        {rule.method === 'browser' && (
          <>
            Counts when, after this form is submitted, a new element matching the success selector shows up on the page. Or leave both empty and call{' '}
            <code>window.r1.formOk('{rule.form || 'Form'}')</code> from the page.
          </>
        )}
      </p>
      {errors[at] && <small className="field-err">{errors[at]}</small>}
    </li>
  );
}
