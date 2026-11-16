/**
 * Settings from the environment: contract §2 variables (incl. GOOGLE_CLIENT_ID/SECRET and
 * TOKEN_ENCRYPTION_KEY) plus the auth additions (BETTER_AUTH_SECRET, SMTP_URL, MAIL_FROM, RATE_LIMIT).
 */
export type Settings = ReturnType<typeof loadSettings>;

const DEV_SECRET = 'dev-only-secret-never-use-when-deployed-0123456789';

export function loadSettings(env: NodeJS.ProcessEnv = process.env) {
  const get = (name: string) => env[name]?.trim() || undefined;
  const required = (name: string) => {
    const v = get(name);
    if (!v) throw new Error(`${name} is required`);
    return v;
  };

  const mode = get('ENV') ?? 'dev'; // contract §2: test | prod. Unset = local development.
  const appBaseUrl = (get('APP_BASE_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');
  // Anything reachable over HTTPS counts as deployed, whatever ENV says.
  const deployed = mode !== 'dev' || appBaseUrl.startsWith('https://');

  const secret = deployed ? required('BETTER_AUTH_SECRET') : (get('BETTER_AUTH_SECRET') ?? DEV_SECRET);
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');

  const googleId = get('GOOGLE_CLIENT_ID');
  const googleSecret = get('GOOGLE_CLIENT_SECRET');

  // Encrypts stored Search Console refresh tokens (src/seal.ts). 32 random bytes, base64 (`openssl rand -base64 32`).
  // Deployed without it, the Search Console connection is off; in development a fixed key stands in.
  const tokenKeyText = get('TOKEN_ENCRYPTION_KEY');
  const tokenKey = tokenKeyText ? Buffer.from(tokenKeyText, 'base64') : deployed ? null : Buffer.alloc(32, 'dev-only-token-key');
  if (tokenKey && tokenKey.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)');

  return {
    mode,
    deployed,
    version: get('APP_VERSION') ?? '0.1.0',
    host: get('HOST') ?? '127.0.0.1',
    port: Number(get('PORT') ?? 8081),
    databaseUrl: required('DATABASE_URL'),
    appBaseUrl,
    collectBaseUrl: (get('COLLECT_BASE_URL') ?? 'http://localhost:8080').replace(/\/+$/, ''),
    secret,
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
    tokenKey,
    /** Unset in development: emails are printed to the log instead of sent. */
    smtpUrl: deployed ? required('SMTP_URL') : get('SMTP_URL'),
    mailFrom: get('MAIL_FROM') ?? 'Rate 1 <no-reply@localhost>',
    /** Header the reverse proxy sets to the client IP, replacing any client value (rate limits, session IP). */
    clientIpHeader: (get('CLIENT_IP_HEADER') ?? 'x-forwarded-for').toLowerCase(),
    rateLimit: get('RATE_LIMIT') !== 'off',
  };
}
