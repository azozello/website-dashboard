import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Range } from './lib/analysis';
import type { MetricKey } from './lib/metrics';

export type ShowState = Partial<Record<MetricKey, boolean>>;

interface DashboardState {
  range: Range;
  setRange: (r: Range) => void;
  /** Metrics plotted on the overview chart. */
  show: ShowState;
  toggleShow: (k: MetricKey) => void;
  /** Metrics plotted on page charts (shared across pages). */
  pshow: ShowState;
  togglePshow: (k: MetricKey) => void;
}

const Ctx = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<Range>(13);
  const [show, setShow] = useState<ShowState>({ r1: true, scroll: true });
  const [pshow, setPshow] = useState<ShowState>({ r1: true, time: true });
  const value: DashboardState = {
    range,
    setRange,
    show,
    toggleShow: (k) => setShow((s) => ({ ...s, [k]: !s[k] })),
    pshow,
    togglePshow: (k) => setPshow((s) => ({ ...s, [k]: !s[k] })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return v;
}
