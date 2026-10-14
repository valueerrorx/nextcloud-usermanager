import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSingleCreate, einzelErgebnis, kannAnlegen, useridHinweis } from '../src/shared/userCreate.js';
import { validateUserid } from '../src/shared/username.js';
import { getSteps } from '../src/main/actions/operations.js';
import { MESSAGES } from '../src/shared/messages.js';

describe('validateUserid manuell', () => {
  it('max_mueller ist gültig, müller! nicht', () => {
    expect(validateUserid('max_mueller', { quelle: 'manuell' })).toEqual({ ok: true });
    expect(validateUserid('müller!', { quelle: 'manuell' }).messageId).toBe('username_zeichen');
  });
});

describe('kannAnlegen', () => {
  it('braucht gültige userid, Passwort und keinen laufenden Job', () => {
    expect(kannAnlegen({ userid: 'max', password: 'x', laeuft: false })).toBe(true);
    expect(kannAnlegen({ userid: 'müller!', password: 'x', laeuft: false })).toBe(false);
    expect(kannAnlegen({ userid: '', password: 'x', laeuft: false })).toBe(false);
    expect(kannAnlegen({ userid: 'max', password: '  ', laeuft: false })).toBe(false);
    expect(kannAnlegen({ userid: 'max', password: 'x', laeuft: true })).toBe(false);
  });
});

describe('useridHinweis', () => {
  it('leer und gültig -> null, ungültig -> deutscher Text', () => {
    expect(useridHinweis('')).toBeNull();
    expect(useridHinweis('max_mueller')).toBeNull();
    expect(useridHinweis('müller!')).toBe(MESSAGES.username_zeichen);
  });
});

describe('buildSingleCreate', () => {
  it('liefert genau ein Item mit der S11-params-Form', () => {
    const r = buildSingleCreate({
      userid: 'max_mueller', password: 'pw', displayName: ' Max Müller ', groups: ['Lehrer'], quotaId: '5gb',
    });
    expect(r.items).toEqual(['max_mueller']);
    expect(r.params).toEqual({
      byUserid: { max_mueller: { password: 'pw', displayName: 'Max Müller' } },
      groups: ['Lehrer'],
      quota: String(5 * 1073741824),
    });
  });

  it('ohne Anzeigename und Kontingent: displayName undefined, quota null', () => {
    const r = buildSingleCreate({ userid: 'a', password: 'pw', displayName: '', groups: [], quotaId: null });
    expect(r.params.byUserid.a.displayName).toBeUndefined();
    expect(r.params.quota).toBeNull();
  });

  it('unbekannte Kontingent-ID -> quota null', () => {
    const r = buildSingleCreate({ userid: 'a', password: 'pw', displayName: '', groups: [], quotaId: 'gibtsnicht' });
    expect(r.params.quota).toBeNull();
  });

  it('Preset unbegrenzt -> quota none', () => {
    const r = buildSingleCreate({ userid: 'a', password: 'pw', displayName: '', groups: [], quotaId: 'unbegrenzt' });
    expect(r.params.quota).toBe('none');
  });

  it('Passwort wird getrimmt gesendet', () => {
    const r = buildSingleCreate({ userid: 'a', password: ' pw ', displayName: '', groups: [], quotaId: null });
    expect(r.params.byUserid.a.password).toBe('pw');
  });

  it('Gruppen aus einem Vue-Proxy werden als klonbares Array gesendet', () => {
    const r = buildSingleCreate({
      userid: 'a', password: 'pw', displayName: '', groups: reactive(['Lehrer']), quotaId: null,
    });
    expect(r.params.groups).toEqual(['Lehrer']);
    expect(structuredClone(r.params).groups).toEqual(['Lehrer']);
  });
});

describe('einzelErgebnis', () => {
  it('fehler 102 und 107 werden deutsch aufgelöst', () => {
    expect(einzelErgebnis({ userid: 'a', status: 'fehler', grund: 'benutzer_existiert_bereits' }))
      .toEqual({ erfolg: false, text: 'Benutzer existiert bereits.' });
    expect(einzelErgebnis({ userid: 'a', status: 'fehler', grund: 'passwort_policy' }).text)
      .toContain('Passwortrichtlinie');
  });

  it('teilweise nennt die Gruppe aus dem echten teilfehlerGrund und zählt als angelegt', () => {
    const steps = getSteps('user.create', 'a', { byUserid: { a: { password: 'pw' } }, groups: ['Lehrer'] });
    const grund = steps.find((st) => st.name === 'Lehrer').teilfehlerGrund;
    const r = einzelErgebnis({ userid: 'a', status: 'teilweise', grund });
    expect(r.erfolg).toBe(true);
    expect(r.text).toContain('Gruppe "Lehrer" konnte nicht zugewiesen werden');
  });

  it('ok -> Erfolgstext aus messages', () => {
    expect(einzelErgebnis({ userid: 'a', status: 'ok', grund: null }))
      .toEqual({ erfolg: true, text: MESSAGES.benutzer_angelegt });
  });

  it('Code 111 -> userid_nicht_erzeugbar', () => {
    expect(einzelErgebnis({ userid: 'a', status: 'fehler', grund: 'userid_nicht_erzeugbar' }))
      .toEqual({ erfolg: false, text: MESSAGES.userid_nicht_erzeugbar });
  });

  it('nicht ausgeführt ohne Grund -> Fallbacktext', () => {
    expect(einzelErgebnis({ userid: 'a', status: 'nicht ausgeführt', grund: null }))
      .toEqual({ erfolg: false, text: MESSAGES.benutzer_anlegen_fehlgeschlagen });
  });

  it('unbekannter Grund wird unverändert angezeigt', () => {
    expect(einzelErgebnis({ userid: 'a', status: 'fehler', grund: 'Sonderfall xyz' }).text).toBe('Sonderfall xyz');
  });
});

describe('Verdrahtung S14', () => {
  const view = readFileSync(fileURLToPath(new URL('../src/renderer/views/UsersView.vue', import.meta.url)), 'utf8');
  it('UsersView prüft mit useridHinweis und legt über actionsRun user.create an', () => {
    expect(view).toContain('useridHinweis(');
    expect(view).toMatch(/actionsRun\([\s\S]*?action: 'user\.create'/);
  });
});
