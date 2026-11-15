/** Environment (§2). Everything has a development default. */
export interface Settings {
  env: 'test' | 'prod' | 'dev';
  port: number;
  host: string;
  databaseUrl: string;
  collectBaseUrl: string;
  trustedProxyCidrs: string[];
  clientIpHeader: string;
  r1JsDir: string;
  version: string;
}

export function loadSettings(e: NodeJS.ProcessEnv = process.env): Settings {
  const env = e.ENV === 'prod' || e.ENV === 'test' ? e.ENV : 'dev';
  return {
    env,
    port: Number(e.PORT || 8080),
    host: e.HOST || '0.0.0.0',
    databaseUrl: e.DATABASE_URL || 'postgres://rate1:rate1@localhost:5433/rate1',
    collectBaseUrl: e.COLLECT_BASE_URL || 'http://localhost:8080',
    trustedProxyCidrs: (e.TRUSTED_PROXY_CIDRS || '127.0.0.1/32,::1/128')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    clientIpHeader: (e.CLIENT_IP_HEADER || 'x-forwarded-for').toLowerCase(),
    r1JsDir: e.R1_JS_DIR || new URL('../../tracker/dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    version: e.APP_VERSION || '0.1.0',
  };
}
