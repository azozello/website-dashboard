import { rangeText, type Totals } from '../lib/analysis';
import { cssVars } from '../lib/format';
import { METRICS, type MetricKey } from '../lib/metrics';
import type { ShowState } from '../state';
import { Change } from './ui';

interface Props {
  T: Totals;
  P: Totals;
  show: ShowState;
  onToggle: (k: MetricKey) => void;
  /** On a page view, show the site average instead of the metric description. */
  siteT?: Totals;
  /** Pages the site average is spread over. */
  pageCount?: number;
}

/** The six metric cards; each one toggles its line on the chart below. */
export function MetricCards({ T, P, show, onToggle, siteT, pageCount = 1 }: Props) {
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
              Site average: {m.f(m.count ? siteT[m.k] / Math.max(1, pageCount) : siteT[m.k])}
              {m.count ? ' per page' : ''}
            </span>
          ) : (
            <span className="s">{m.sub}</span>
          )}
          <span className="v" title={m.k === 'r1' ? rangeText(T.conv, T.vis) : undefined}>
            {m.f(T[m.k])}
          </span>
          <span className="d">
            <Change cur={T[m.k]} prev={P[m.k]} rate={m.rate} /> vs. previous period
          </span>
        </button>
      ))}
    </div>
  );
}
