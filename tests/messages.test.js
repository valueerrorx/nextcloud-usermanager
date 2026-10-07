// S02 messages.js: forward direction only — every messageId validateUserid can produce
// resolves to the exact German text pinned in ARCHITECTURE.md §6.2.
// No allowlist of unused ids (REVIEW-NOTES [S01]).
import { describe, it, expect, vi } from 'vitest';
import { MESSAGES } from '../src/shared/messages.js';
import { validateUserid } from '../src/shared/username.js';
import { createOcsClient } from '../src/main/ocs/client.js';

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

// S03 messages.js: forward direction only — every one of the 9 new OCS messageIds is produced
// by driving createOcsClient().request through a suitably mocked fetchImpl (S03 spec §Abnahme 15),
// never by a literal comparison against the MESSAGES map. No allowlist of unused ids.
function fakeResponse({ status = 200, body = '' } = {}) {
  return { status, headers: { get: () => null }, text: async () => body };
}

function envelope(statuscode, data) {
  return JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode }, data } });
}

const clientOpts = { baseUrl: 'https://h', adminUser: 'user', appPassword: 'passwort' };

// Each case produces its messageId via the earliest-matching classification path from §4, with
// the method chosen so the result does not retry and change versuche-dependent behaviour.
const OCS_DRIVE_CASES = [
  { messageId: 'falsche_zugangsdaten', method: 'GET', fetchImpl: async () => fakeResponse({ status: 401 }) },
  { messageId: 'kein_admin', method: 'GET', fetchImpl: async () => fakeResponse({ status: 403 }) },
  { messageId: 'server_blockt_vorerst', method: 'GET', fetchImpl: async () => fakeResponse({ status: 429 }) },
  { messageId: 'falscher_basispfad', method: 'GET', fetchImpl: async () => fakeResponse({ status: 200, body: '<html>nope</html>' }) },
  { messageId: 'server_nicht_erreichbar', method: 'GET', fetchImpl: async () => { throw new Error('connect failed'); } },
  {
    messageId: 'zeitueberschreitung',
    method: 'GET',
    fetchImpl: async () => {
      throw { name: 'TimeoutError' };
    },
  },
  {
    messageId: 'zertifikat_nicht_vertraut',
    method: 'GET',
    fetchImpl: async () => {
      const err = new Error('cert');
      err.cause = { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' };
      throw err;
    },
  },
  { messageId: 'unerwarteter_serverfehler', method: 'POST', fetchImpl: async () => fakeResponse({ status: 500, body: envelope(100, null) }) },
  { messageId: 'ocs_fehler', method: 'POST', fetchImpl: async () => fakeResponse({ status: 200, body: envelope(101, null) }) },
];

describe('messages.js — die 9 neuen S03-OCS-IDs über request treiben (Vorwärtsrichtung)', () => {
  for (const { messageId, method, fetchImpl } of OCS_DRIVE_CASES) {
    it(`${messageId} -> MESSAGES.${messageId}`, async () => {
      const client = createOcsClient({ ...clientOpts, fetchImpl, sleep: vi.fn() });
      const result = await client.request({ method, path: '/cloud/users' });
      expect(result.messageId).toBe(messageId);
      expect(result.message).toBe(MESSAGES[messageId]);
    });
  }
});
