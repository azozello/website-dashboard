/** Types and small helpers for the site settings and setup checklist screens (app API, /api/sites/:siteId/…). */

export type Platform = 'php' | 'wordpress' | 'wix';
export type Method = 'server' | 'webhook' | 'browser' | 'thankyou';

export interface SiteDetails {
  id: string;
  name: string;
  platform: Platform;
  timezone: string;
  allowedOrigins: string[];
  siteKey: string;
  createdAt: string;
  role: 'owner' | 'admin' | 'member';
}

export interface Rule {
  method: Method;
  form: string;
  counts: boolean;
  source?: string;
  formId?: string;
  path?: string;
  selector?: string;
  successSelector?: string;
}

export interface Section {
  path?: string;
  selector: string;
  name: string;
}

export interface SiteConfig {
  version: number;
  spa: 'auto' | 'off';
  sections: Section[];
  bookingPaths: string[];
  requestRules: Rule[];
  updatedAt: string | null;
}

export interface DetectedForm {
  source: string;
  id: string;
  title: string;
}

export type CheckStatus = 'pass' | 'fail' | 'pending';
export interface Check {
  id: string;
  status: CheckStatus;
  reason: string;
  detail?: { lastAt?: string; plugins?: string[]; error?: string | null; status?: string | null; property?: string; pluginVersion?: string | null };
}
export interface Checklist {
  platform: Platform;
  checkedAt: string;
  checks: Check[];
  install: { siteKey: string; scriptTag: string; allowedOrigins: string[] };
}

/** Error body of a 400 from PUT /config: which field and why. */
export interface FieldError {
  field: string;
  message: string;
}

/** "https://www.example.com/x" → "https://www.example.com"; null when not an http(s) URL (same rule as the API). */
export function toOrigin(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return /^https?:$/.test(u.protocol) && (u.hostname.includes('.') || u.hostname === 'localhost') ? u.origin : null;
  } catch {
    return null;
  }
}

/** Whether the browser accepts a CSS selector. */
export function validSelector(s: string): boolean {
  if (!s.trim()) return true;
  try {
    document.createDocumentFragment().querySelector(s);
    return true;
  } catch {
    return false;
  }
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const PLATFORM_NAME: Record<Platform, string> = { wordpress: 'WordPress', wix: 'Wix', php: 'Custom / PHP' };
