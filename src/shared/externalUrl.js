export const ABOUT_URL = 'https://xapient.solutions/';

const ALLOWED_HOSTS = new Set(['xapient.solutions']);

// Host (with port) of the connected server, only when it is an https URL.
function serverHost(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:' ? url.host : null;
  } catch {
    return null;
  }
}

// Gate for shell.openExternal: https only, exact allowed host (or the connected server), no embedded credentials.
export function isAllowedExternalUrl(input, connectedBaseUrl = null) {
  if (typeof input !== 'string') return false;
  let url;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const extra = serverHost(connectedBaseUrl);
  return ALLOWED_HOSTS.has(url.hostname) || (extra !== null && url.host === extra);
}

// The connected server's URL for the "Nextcloud öffnen" link, or null when it is not https.
export function nextcloudLink(baseUrl) {
  return serverHost(baseUrl) === null ? null : baseUrl;
}
