import { formatTimestamp } from './time.js';

// Test-instance prefill (DECISIONS 2026-10-09, provisional - remove before distribution).
export const DEFAULT_BASE_URL = 'https://cloud.xapient.solutions';

// Initial popup fields: saved server/user win over the default URL; the password is never prefilled.
export function initialConnectForm(status) {
  return {
    baseUrl: status?.savedBaseUrl || DEFAULT_BASE_URL,
    adminUser: status?.savedAdminUser ?? '',
    appPassword: '',
    remember: false,
  };
}

// 'pruefe' = startup check running, 'dialog' = connection popup, 'bereit' = app usable.
export function uiPhase({ checked, connected }) {
  if (connected) return 'bereit';
  return checked ? 'dialog' : 'pruefe';
}

export function statusDot({ connected, connecting }) {
  if (connecting) return 'connecting';
  return connected ? 'connected' : 'disconnected';
}

// Host only, never the full URL (path/credentials stay out of the sidebar).
export function hostLabel(baseUrl) {
  if (!baseUrl) return 'Nicht verbunden';
  try {
    return new URL(baseUrl).hostname || 'Nicht verbunden';
  } catch {
    return 'Nicht verbunden';
  }
}

export function lastLoadLabel(ms) {
  return ms ? `Zuletzt: ${formatTimestamp(ms)}` : '';
}
