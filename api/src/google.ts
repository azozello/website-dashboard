/**
 * The Google calls behind the Search Console connection (contract §0 I8): OAuth 2.0 for web server apps
 * (code flow with PKCE, offline access) and the Search Console API (sites list, Search Analytics).
 * An interface, so tests can hand the app a fake Google.
 */

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/webmasters/v3';
const TIMEOUT_MS = 30_000;

export interface Tokens {
  accessToken: string;
  refreshToken: string | null;
  /** Space-separated scopes the user actually granted (they can untick some). */
  scope: string;
  /** From the ID token, when `openid email` was granted. */
  email: string | null;
}

export interface GscProperty {
  /** "https://www.example.com/" (URL prefix) or "sc-domain:example.com" (domain). */
  siteUrl: string;
  /** siteOwner, siteFullUser, siteRestrictedUser, siteUnverifiedUser. */
  permissionLevel: string;
}

export type Dimension = 'date' | 'page' | 'query';

export interface AnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}

export interface AnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions: Dimension[];
  rowLimit: number;
  startRow: number;
}

/**
 * A refused call. code: invalid_grant (refresh token revoked or expired), forbidden (no access to the property),
 * unauthorized, unavailable (rate limit, server error, network: try again later), bad_response, or Google's own code.
 */
export class GoogleError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? `google ${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

export interface GoogleApi {
  authUrl(p: { redirectUri: string; state: string; codeChallenge: string }): string;
  exchangeCode(p: { code: string; redirectUri: string; codeVerifier: string }): Promise<Tokens>;
  /** A fresh access token for a stored refresh token. */
  refresh(refreshToken: string): Promise<string>;
  listProperties(accessToken: string): Promise<GscProperty[]>;
  searchAnalytics(accessToken: string, property: string, q: AnalyticsRequest): Promise<AnalyticsRow[]>;
  /** Best effort; Google answers 400 for a token that is already gone. */
  revoke(token: string): Promise<void>;
}

/** Email claim of an ID token received straight from Google's token endpoint over TLS (no signature check needed). */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof claims.email === 'string' ? claims.email : null;
  } catch {
    return null;
  }
}

export function createGoogleApi(client: { clientId: string; clientSecret: string }, fetchImpl: typeof fetch = fetch): GoogleApi {
  async function call(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new GoogleError(0, 'unavailable', 'google unreachable');
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok && body) return body;
    if (res.ok) throw new GoogleError(res.status, 'bad_response');
    if (res.status === 429 || res.status >= 500) throw new GoogleError(res.status, 'unavailable');
    // Token endpoint: {"error": "invalid_grant", ...}; APIs: {"error": {"code": 403, "status": "PERMISSION_DENIED"}}.
    const err = body?.error;
    if (typeof err === 'string') throw new GoogleError(res.status, err);
    if (res.status === 401) throw new GoogleError(res.status, 'unauthorized');
    if (res.status === 403 || res.status === 404) throw new GoogleError(res.status, 'forbidden');
    throw new GoogleError(res.status, 'bad_request');
  }

  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

  return {
    authUrl({ redirectUri, state, codeChallenge }) {
      const u = new URL(AUTH_URL);
      u.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: `openid email ${GSC_SCOPE}`,
        access_type: 'offline',
        // consent: always hand out a refresh token, also when this account connected before.
        prompt: 'select_account consent',
        include_granted_scopes: 'false',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return u.toString();
    },

    async exchangeCode({ code, redirectUri, codeVerifier }) {
      const b = await call(
        TOKEN_URL,
        form({ code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }),
      );
      if (typeof b.access_token !== 'string') throw new GoogleError(200, 'bad_response');
      return {
        accessToken: b.access_token,
        refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
        scope: typeof b.scope === 'string' ? b.scope : '',
        email: emailFromIdToken(b.id_token),
      };
    },

    async refresh(refreshToken) {
      const b = await call(TOKEN_URL, form({ refresh_token: refreshToken, client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'refresh_token' }));
      if (typeof b.access_token !== 'string') throw new GoogleError(200, 'bad_response');
      return b.access_token;
    },

    async listProperties(accessToken) {
      const b = await call(`${API}/sites`, { headers: { authorization: `Bearer ${accessToken}` } });
      const entries = Array.isArray(b.siteEntry) ? (b.siteEntry as Record<string, unknown>[]) : [];
      return entries
        .filter((e) => typeof e.siteUrl === 'string')
        .map((e) => ({ siteUrl: String(e.siteUrl), permissionLevel: String(e.permissionLevel ?? '') }));
    },

    async searchAnalytics(accessToken, property, q) {
      const b = await call(`${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...q, type: 'web' }),
      });
      const rows = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]) : [];
      return rows.map((r) => ({
        keys: Array.isArray(r.keys) ? r.keys.map(String) : [],
        clicks: Number(r.clicks ?? 0),
        impressions: Number(r.impressions ?? 0),
        position: Number(r.position ?? 0),
      }));
    },

    async revoke(token) {
      try {
        await fetchImpl(REVOKE_URL, { ...form({ token }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        /* best effort */
      }
    },
  };
}
