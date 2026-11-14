export const VERSION = '1.5.0';
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : new Date().toISOString();
// e.g. "v1.5.0 · built Nov 11, 7:20 PM". Compare this with what you expect to know if a deploy went live.
export function buildLabel() {
  const d = new Date(BUILD);
  const when = isNaN(d) ? BUILD : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `v${VERSION} · built ${when}`;
}
