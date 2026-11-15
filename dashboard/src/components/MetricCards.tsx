import type { Totals } from '../lib/analysis';
import { cssVars } from '../lib/format';
import { METRICS, type MetricKey } from '../lib/metrics';
import { PAGES } from '../mock/data';
import type { ShowState } from '../state';
import { Change } from './ui';

interface Props {
  T: Totals;
  P: Totals;
  show: ShowState;
  onToggle: (k: MetricKey) => void;
  /** On a page view, show the site average instead of the metric description. */
  siteT?: Totals;
}

/** The six metric cards; each one toggles its line on the chart below. */
export function MetricCards({ T, P, show, onToggle, siteT }: Props) {
  return (
    <div className="cards" role="group" aria-label="Show numbers on the chart">
      {METRICS.map((m) => (
        <button key={m.k} className="card" aria-pressed={!!show[m.k]} style={cssVars({ '--c': m.c })} onClick={() => onToggle(m.k)}>
          <span className="l">
            <i aria-hidden="true" />
            {m.label}
          </span>
          {siteT ? (
            <span className="a">
              Site average: {m.f(m.count ? siteT[m.k] / PAGES.length : siteT[m.k])}
              {m.count ? ' per page' : ''}
            </span>
          ) : (
            <span className="s">{m.sub}</span>
          )}
          <span className="v">{m.f(T[m.k])}</span>
          <span className="d">
            <Change cur={T[m.k]} prev={P[m.k]} rate={m.rate} /> vs. previous period
          </span>
        </button>
      ))}
    </div>
  );
}
