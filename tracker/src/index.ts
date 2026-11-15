import { init } from './tracker';

try {
  const d = document;
  init(window, (d.currentScript as HTMLScriptElement | null) || d.querySelector('script[data-site][src*="/v1/r1"]'));
} catch {
  /* never throw into the host page */
}
