// Initial-password rules for CSV import (DECISIONS "Wie wird das Initialpasswort gebildet?" /
// "Prefix-Validierung Initialpasswort"). Pure, no I/O.

const PREFIX_MIN = 3;
const PREFIX_MAX = 20;
const PREFIX_CHARSET = /^[A-Za-z0-9]+$/;
const SPECIAL_CHAR = '!';
const BEISPIEL_DDMMYYYY = '01012010';
const MIN_PASSWORD_LENGTH = 10;

// Own messageId per violation (DECISIONS), checked in this order: missing, length, charset, case.
export function validatePrefix(p) {
  if (typeof p !== 'string' || p.length === 0) return { ok: false, messageId: 'prefix_leer' };
  if (p.length < PREFIX_MIN || p.length > PREFIX_MAX) return { ok: false, messageId: 'prefix_laenge' };
  if (!PREFIX_CHARSET.test(p)) return { ok: false, messageId: 'prefix_zeichen' };
  if (!/^[A-Z]/.test(p)) return { ok: false, messageId: 'prefix_grossbuchstabe' };
  return { ok: true };
}

// The special character is fixed to '!' (DECISIONS "<Sonderzeichen> im Initialpasswort").
export function buildInitialPassword(prefix, ddmmyyyy) {
  return `${prefix}${ddmmyyyy}${SPECIAL_CHAR}`;
}

// Live example in the import dialog. Same code path as the real password, fixed example date,
// so the example can never drift from what buildInitialPassword actually produces.
export function beispielPasswort(prefix) {
  return buildInitialPassword(prefix, BEISPIEL_DDMMYYYY);
}

// Local defensive check (DECISIONS: "Ergebnis lokal auf >= 10 Zeichen prüfen").
export function checkMinLength(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}
