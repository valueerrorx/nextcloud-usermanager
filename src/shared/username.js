// 1:1 port of the normalization/composition rules from the reference project's
// src/utils/upn.js (see docs/RESEARCH-UPN.md §1, §2, §3). No domain, no length limit here.

export const MAX_USERID = 64;
export const ORDER_GIVEN_FIRST = 'givenFirst';
export const ORDER_SURNAME_FIRST = 'surnameFirst';

// Reserved Nextcloud userids (RESEARCH-OCS §7), lowercase. appdata_* is checked separately below.
export const RESERVED_USERIDS = Object.freeze([
  '.htaccess',
  'files_external',
  '__groupfolders',
  '.ncdata',
  'owncloud.log',
  'nextcloud.log',
  'updater.log',
  'audit.log',
]);

const GENERATOR_CHARSET = /^[a-z0-9.]+$/;
const MANUAL_CHARSET = /^[A-Za-z0-9_.@-]+$/;

// Unknown values fall back to the app default, like normalizeUpnOrder() in the reference project.
export function normalizeOrder(order) {
  return order === ORDER_SURNAME_FIRST ? ORDER_SURNAME_FIRST : ORDER_GIVEN_FIRST;
}

// Normalize one name component: umlauts/diacritics -> ascii, strip the rest. No length limit, idempotent.
export function normalizeComponent(text) {
  if (!text) return '';
  let s = String(text);
  // German umlauts and eszett run before the NFD fallback, otherwise decomposition would strip the dots first
  s = s.replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/[ß]/g, 'ss');
  s = s.replace(/[àáâãăÀÁÂÃĂ]/g, 'a').replace(/[èéêëÈÉÊË]/g, 'e').replace(/[ìíîïÌÍÎÏ]/g, 'i');
  s = s.replace(/[òóôõÒÓÔÕ]/g, 'o').replace(/[ùúûÙÚÛ]/g, 'u').replace(/[ýÿȳÝŸȲ]/g, 'y');
  s = s.replace(/[çćčÇĆČ]/g, 'c').replace(/[ñÑ]/g, 'n');
  s = s.replace(/[žŽ]/g, 'z').replace(/[šŠ]/g, 's').replace(/[đĐ]/g, 'd');
  // Generic fallback for remaining accented latin letters: decompose and strip combining marks
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s.toLowerCase().replace(/[^a-z0-9.]/g, '');
}

// buildUsername normalizes its own arguments (like buildUpn, not buildUpnLocal); no domain is appended.
export function buildUsername(vorname, nachname, order) {
  const vn = normalizeComponent(vorname);
  const nn = normalizeComponent(nachname);
  if (!vn || !nn) return '';
  return normalizeOrder(order) === ORDER_SURNAME_FIRST ? `${nn}.${vn}` : `${vn}.${nn}`;
}

// Shrinks the surname component to fit max; the given name and suffix are never touched.
// Missing first/second/suffix fail closed to '', matching normalizeComponent's falsy guard.
// The argument object itself defaults to {} so truncateToFit() and truncateToFit(null) don't throw.
export function truncateToFit(args) {
  const { first = '', second = '', suffix = '', max = MAX_USERID } = args ?? {};
  const budget = max - first.length - 1 - suffix.length;
  if (budget >= second.length) return { second, gekuerzt: false, passt: true };
  if (budget >= 1) return { second: second.slice(0, budget), gekuerzt: true, passt: true };
  return { second, gekuerzt: false, passt: false };
}

function isReserved(s) {
  const lower = s.toLowerCase();
  return RESERVED_USERIDS.includes(lower) || lower.startsWith('appdata_');
}

// Validates a userid string, never transforms it. quelle selects the charset: 'manuell' or 'generator' (default, strictest).
// options itself may be any junk value (null, string, number); only a real 'manuell' loosens the charset.
export function validateUserid(s, options) {
  if (typeof s !== 'string' || s.length === 0) return { ok: false, messageId: 'username_leer' };
  if (/^\.+$/.test(s)) return { ok: false, messageId: 'username_nur_punkte' };
  if (s.length > MAX_USERID) return { ok: false, messageId: 'username_zu_lang' };
  if (isReserved(s)) return { ok: false, messageId: 'username_reserviert' };
  const charset = options?.quelle === 'manuell' ? MANUAL_CHARSET : GENERATOR_CHARSET;
  if (!charset.test(s)) return { ok: false, messageId: 'username_zeichen' };
  return { ok: true };
}
