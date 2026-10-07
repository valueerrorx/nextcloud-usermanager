// S05 A4 Abnahme 5: mapOcsError, moved here from S03. No global code table (REVIEW-NOTES 3).
import { describe, expect, it } from 'vitest';
import { mapOcsError } from '../src/main/ocs/errors.js';
import { MESSAGES } from '../src/shared/messages.js';

describe('mapOcsError', () => {
  it('kind ocs mit Code in der Map -> der gemappte messageId', () => {
    const result = mapOcsError({ ok: false, kind: 'ocs', ocsCode: 102, messageId: 'ocs_fehler' }, { 102: 'user_nicht_gefunden' }, 'userliste_fehlgeschlagen');
    expect(result.messageId).toBe('user_nicht_gefunden');
    expect(result.message).toBe(MESSAGES.user_nicht_gefunden);
  });

  it('kind ocs mit Code NICHT in der Map -> fallbackId', () => {
    const result = mapOcsError({ ok: false, kind: 'ocs', ocsCode: 999, messageId: 'ocs_fehler' }, { 102: 'user_nicht_gefunden' }, 'userliste_fehlgeschlagen');
    expect(result.messageId).toBe('userliste_fehlgeschlagen');
  });

  it('kind auth bleibt bei falsche_zugangsdaten, auch wenn die Map 401 enthielte - die Map wird ignoriert', () => {
    const result = mapOcsError({ ok: false, kind: 'auth', ocsCode: null, messageId: 'falsche_zugangsdaten' }, { 401: 'user_nicht_gefunden' }, 'userliste_fehlgeschlagen');
    expect(result.messageId).toBe('falsche_zugangsdaten');
  });

  it('ok: true wirft (Programmierfehler)', () => {
    expect(() => mapOcsError({ ok: true, data: {} }, {}, 'userliste_fehlgeschlagen')).toThrow();
  });

  // MINOR 9 (Review S05): eine im Code getippte messageId, die in messages.js keinen Eintrag
  // hat, darf nicht lautlos zu message: undefined degradieren - sie muss in der Entwicklung auffallen.
  it('eine messageId ohne Eintrag in messages.js wirft, statt message: undefined zu liefern', () => {
    expect(() => mapOcsError({ ok: false, kind: 'ocs', ocsCode: 1, messageId: 'ocs_fehler' }, { 1: 'nicht_vorhandene_id' }, 'userliste_fehlgeschlagen')).toThrow();
  });
});
