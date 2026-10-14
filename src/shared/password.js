// Initial password for CSV import. Prefix may be empty; Nextcloud enforces its own policy.
const SPECIAL_CHAR = '!';
const BEISPIEL_DDMMYYYY = '01012010';

// Fixed trailing '!' (DECISIONS). Empty prefix yields only the birthdate plus that character.
export function buildInitialPassword(prefix, ddmmyyyy) {
  return `${prefix ?? ''}${ddmmyyyy}${SPECIAL_CHAR}`;
}

// Live example in the import dialog, same path as the real password.
export function beispielPasswort(prefix) {
  return buildInitialPassword(prefix, BEISPIEL_DDMMYYYY);
}
