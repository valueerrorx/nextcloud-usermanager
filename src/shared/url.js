// Normalizes a user-typed Nextcloud server URL. Pure, no I/O (ARCHITECTURE §2).
const SCHEME_PATTERN = /:\/\//;

// First path segment matching one of these (case-insensitive) and everything after it is cut -
// these are reset/API/UI entry points a user might paste by accident (S04 spec A1).
const CUT_SEGMENTS = new Set(['ocs', 'index.php', 'settings', 'apps', 'login']);

export function normalizeBaseUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, messageId: 'url_leer' };
  }
  if (!SCHEME_PATTERN.test(input)) {
    return { ok: false, messageId: 'url_kein_schema' };
  }

  // Parse first, then check the protocol - a string comparison would wrongly reject HTTPS://host.
  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, messageId: 'url_ungueltig' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, messageId: 'url_nur_https' };
  }
  if (url.username || url.password) {
    return { ok: false, messageId: 'url_mit_zugangsdaten' };
  }

  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  const kept = [];
  for (const segment of segments) {
    if (CUT_SEGMENTS.has(segment.toLowerCase())) break;
    kept.push(segment); // path case is preserved on purpose - subpaths are case-sensitive
  }
  const path = kept.length > 0 ? `/${kept.join('/')}` : '';

  // url.host is already lowercase (URL spec); search/hash are dropped by not reading them.
  return { ok: true, baseUrl: `${url.protocol}//${url.host}${path}` };
}
