export const ABOUT_URL = 'https://xapient.solutions/';

const ALLOWED_HOSTS = new Set(['xapient.solutions']);

// Gate for shell.openExternal: https only, exact allowed host, no embedded credentials.
export function isAllowedExternalUrl(input) {
  if (typeof input !== 'string') return false;
  let url;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return ALLOWED_HOSTS.has(url.hostname);
}
