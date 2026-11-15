import { useEffect, useState } from 'react';
import { api } from '../auth/client';
import { Head, Panel } from '../components/ui';
import { useSiteId } from '../site';

interface SiteInfo {
  name: string;
  platform: 'php' | 'wordpress' | 'wix';
  allowedOrigins: string[];
  siteKey: string;
  scriptTag: string;
}

/** Shown for every site view until the data API delivers data for this site. */
export function NoData() {
  const siteId = useSiteId();
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSite(null);
    api<SiteInfo>(`/api/sites/${encodeURIComponent(siteId)}`)
      .then(setSite)
      .catch(() => setSite(null));
  }, [siteId]);

  return (
    <>
      <Head title="No data yet">
        Numbers appear here once visits arrive from {site ? <b>{site.allowedOrigins.join(', ')}</b> : 'your website'}.
      </Head>
      {site && (
        <Panel title={site.platform === 'wordpress' ? 'Connect WordPress' : 'Add the tracking tag'}>
          <div className="nodata">
            {site.platform === 'wordpress' ? (
              <ol>
                <li>
                  Install and activate the <b>Rate 1 Connector</b> plugin.
                </li>
                <li>
                  In WordPress, open <b>Settings → Rate 1</b> and click <b>Connect to Rate 1</b>, then choose this website.
                </li>
              </ol>
            ) : (
              <p>Put this tag in the &lt;head&gt; of every page{site.platform === 'wix' ? ' (Wix: Settings → Custom Code → Head → All pages)' : ''}:</p>
            )}
            <div className="copy">
              <code>{site.scriptTag}</code>
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  navigator.clipboard?.writeText(site.scriptTag).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }
              >
                {copied ? 'Copied' : 'Copy tag'}
              </button>
            </div>
            {site.platform === 'wordpress' && <p className="muted">The plugin adds this tag for you; it's here for checking.</p>}
          </div>
        </Panel>
      )}
    </>
  );
}
