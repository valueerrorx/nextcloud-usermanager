// S02 messages.js: forward direction only — every messageId validateUserid can produce
// resolves to the exact German text pinned in ARCHITECTURE.md §6.2.
// No allowlist of unused ids (REVIEW-NOTES [S01]).
import { describe, it, expect } from 'vitest';
import { MESSAGES } from '../src/shared/messages.js';
import { validateUserid } from '../src/shared/username.js';

// Exact wording from ARCHITECTURE.md §6.2 — a truncated or English text must fail here.
const EXPECTED_TEXT = {
  username_leer: 'Bitte einen Benutzernamen eingeben.',
  username_nur_punkte: 'Ein Benutzername darf nicht nur aus Punkten bestehen.',
  username_zu_lang: 'Username ist auch nach Kürzen des Nachnamens zu lang.',
  username_zeichen: 'Der Benutzername enthält nicht erlaubte Zeichen.',
  username_reserviert: 'Dieser Username ist in Nextcloud reserviert.',
};

describe('MESSAGES', () => {
  it('ist eingefroren (frozen)', () => {
    expect(Object.isFrozen(MESSAGES)).toBe(true);
  });
});

describe('messages.js — exakte deutsche Texte aus ARCHITECTURE §6.2', () => {
  for (const [messageId, text] of Object.entries(EXPECTED_TEXT)) {
    it(`MESSAGES.${messageId} === ${JSON.stringify(text)}`, () => {
      expect(MESSAGES[messageId]).toBe(text);
    });
  }
});

// Table-driven: each row drives validateUserid into exactly one of the five S02 error states
// and pins the exact resolved German text, not merely typeof/length.
const DRIVE_CASES = [
  { messageId: 'username_leer', s: '', quelle: 'generator' },
  { messageId: 'username_nur_punkte', s: '...', quelle: 'generator' },
  { messageId: 'username_zu_lang', s: 'a'.repeat(65), quelle: 'generator' },
  { messageId: 'username_reserviert', s: '.htaccess', quelle: 'generator' },
  { messageId: 'username_zeichen', s: 'müller!', quelle: 'generator' },
];

describe('messages.js — validateUserid in alle fünf Fehlerzustände treiben, exakter Text (Vorwärtsrichtung)', () => {
  for (const { messageId, s, quelle } of DRIVE_CASES) {
    it(`${messageId} -> ${JSON.stringify(EXPECTED_TEXT[messageId])}`, () => {
      const result = validateUserid(s, { quelle });
      expect(result.ok).toBe(false);
      expect(result.messageId).toBe(messageId);
      expect(MESSAGES[result.messageId]).toBe(EXPECTED_TEXT[messageId]);
    });
  }
});
