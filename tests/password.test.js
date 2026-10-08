// S09 A2: Prefix-Validierung, Passwortbildung, Mindestlaenge, Live-Beispiel ueber denselben Codepfad.
import { describe, it, expect } from 'vitest';
import { validatePrefix, buildInitialPassword, beispielPasswort, checkMinLength } from '../src/shared/password.js';

describe('validatePrefix — eigene messageId je Verstoss (DECISIONS)', () => {
  it('fehlendes Prefix (undefined) -> prefix_leer', () => {
    expect(validatePrefix(undefined)).toEqual({ ok: false, messageId: 'prefix_leer' });
  });

  it("leerer String '' -> prefix_leer", () => {
    expect(validatePrefix('')).toEqual({ ok: false, messageId: 'prefix_leer' });
  });

  it('Grenzwert 2 Zeichen (zu kurz) -> prefix_laenge', () => {
    expect(validatePrefix('Sc')).toEqual({ ok: false, messageId: 'prefix_laenge' });
  });

  it('Grenzwert 3 Zeichen (gerade noch gueltig) -> ok', () => {
    expect(validatePrefix('Sch')).toEqual({ ok: true });
  });

  it('Grenzwert 20 Zeichen (gerade noch gueltig) -> ok', () => {
    expect(validatePrefix('S'.repeat(20))).toEqual({ ok: true });
  });

  it('Grenzwert 21 Zeichen (zu lang) -> prefix_laenge', () => {
    expect(validatePrefix('S'.repeat(21))).toEqual({ ok: false, messageId: 'prefix_laenge' });
  });

  it('Sonderzeichen im Prefix -> prefix_zeichen', () => {
    expect(validatePrefix('Schul3!')).toEqual({ ok: false, messageId: 'prefix_zeichen' });
  });

  it('kleiner Anfangsbuchstabe -> prefix_grossbuchstabe', () => {
    expect(validatePrefix('schule')).toEqual({ ok: false, messageId: 'prefix_grossbuchstabe' });
  });

  it("gueltiges Prefix 'Schule' -> ok", () => {
    expect(validatePrefix('Schule')).toEqual({ ok: true });
  });

  it('rein numerisches Prefix beginnt nicht mit einem Grossbuchstaben -> prefix_grossbuchstabe', () => {
    expect(validatePrefix('12345')).toEqual({ ok: false, messageId: 'prefix_grossbuchstabe' });
  });
});

describe('buildInitialPassword — festes Schema <Prefix><ddmmyyyy>!', () => {
  it("buildInitialPassword('Schule','01012010') === 'Schule01012010!'", () => {
    expect(buildInitialPassword('Schule', '01012010')).toBe('Schule01012010!');
  });

  it('das Sonderzeichen ist fest "!"', () => {
    expect(buildInitialPassword('Abc', '02022011')).toBe('Abc02022011!');
  });
});

describe('beispielPasswort — derselbe Codepfad wie buildInitialPassword, nur mit Beispielsdatum', () => {
  it("beispielPasswort('Schule') === 'Schule01012010!'", () => {
    expect(beispielPasswort('Schule')).toBe('Schule01012010!');
  });

  it('beispielPasswort(prefix) liefert fuer jedes Prefix exakt dasselbe Ergebnis wie buildInitialPassword(prefix, \'01012010\') (kein zweiter Codepfad)', () => {
    for (const prefix of ['Schule', 'Abc', 'Verwaltung2026']) {
      expect(beispielPasswort(prefix)).toBe(buildInitialPassword(prefix, '01012010'));
    }
  });
});

describe('checkMinLength — lokale Pruefung auf mindestens 10 Zeichen', () => {
  it('ein aus buildInitialPassword gebildetes Passwort mit kurzem Prefix erfuellt die Mindestlaenge', () => {
    const passwort = buildInitialPassword('Sch', '01012010');
    expect(passwort.length).toBeGreaterThanOrEqual(10);
    expect(checkMinLength(passwort)).toBe(true);
  });

  it('Grenzwert genau 10 Zeichen -> true', () => {
    expect(checkMinLength('a'.repeat(10))).toBe(true);
  });

  it('Grenzwert 9 Zeichen -> false', () => {
    expect(checkMinLength('a'.repeat(9))).toBe(false);
  });

  it('nicht-String-Eingabe wirft nicht und liefert false', () => {
    expect(() => checkMinLength(undefined)).not.toThrow();
    expect(checkMinLength(undefined)).toBe(false);
  });
});
