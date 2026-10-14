// Initial password: optional prefix, same path for the live example.
import { describe, it, expect } from 'vitest';
import { buildInitialPassword, beispielPasswort } from '../src/shared/password.js';

describe('buildInitialPassword — Schema <Prefix><ddmmyyyy>!', () => {
  it("buildInitialPassword('Schule','01012010') === 'Schule01012010!'", () => {
    expect(buildInitialPassword('Schule', '01012010')).toBe('Schule01012010!');
  });

  it('leeres Prefix ergibt nur Geburtsdatum plus Ausrufezeichen', () => {
    expect(buildInitialPassword('', '01012010')).toBe('01012010!');
  });

  it('fehlendes Prefix wird wie ein leeres behandelt', () => {
    expect(buildInitialPassword(undefined, '01012010')).toBe('01012010!');
  });

  it('das Sonderzeichen ist fest "!"', () => {
    expect(buildInitialPassword('Abc', '02022011')).toBe('Abc02022011!');
  });
});

describe('beispielPasswort — derselbe Codepfad wie buildInitialPassword, nur mit Beispielsdatum', () => {
  it("beispielPasswort('Schule') === 'Schule01012010!'", () => {
    expect(beispielPasswort('Schule')).toBe('Schule01012010!');
  });

  it('beispielPasswort(prefix) liefert fuer jedes Prefix exakt dasselbe Ergebnis wie buildInitialPassword(prefix, \'01012010\')', () => {
    for (const prefix of ['Schule', '', '1234', 'schule!']) {
      expect(beispielPasswort(prefix)).toBe(buildInitialPassword(prefix, '01012010'));
    }
  });
});
