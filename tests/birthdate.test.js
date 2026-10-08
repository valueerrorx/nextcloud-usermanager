// S09 A1: beide Eingabeformate, die vier Pflichtgrenzwerte, injiziertes heute (ARCHITECTURE §6 Stufe 8).
import { describe, it, expect } from 'vitest';
import { parseBirthdate } from '../src/shared/birthdate.js';

const HEUTE = new Date(2026, 9, 8); // fester Bezugspunkt, damit kein Test vom echten Kalender abhaengt

describe('parseBirthdate — beide akzeptierten Formate (DECISIONS)', () => {
  it("dd.mm.yyyy 'ist akzeptiert und liefert ddmmyyyy", () => {
    expect(parseBirthdate('01.01.2010', { heute: HEUTE })).toEqual({ ok: true, ddmmyyyy: '01012010' });
  });

  it('yyyy-mm-dd ist akzeptiert und liefert dasselbe ddmmyyyy wie dd.mm.yyyy', () => {
    expect(parseBirthdate('2010-01-01', { heute: HEUTE })).toEqual({ ok: true, ddmmyyyy: '01012010' });
  });

  it('Grenzwert einstellige Tage/Monate werden auf zwei Ziffern gepolstert (02.02.2011 -> 02022011)', () => {
    expect(parseBirthdate('02.02.2011', { heute: HEUTE })).toEqual({ ok: true, ddmmyyyy: '02022011' });
  });
});

describe('parseBirthdate — die vier Pflichtgrenzwerte aus A1', () => {
  it('29.02.2024 (Schaltjahr) ist gueltig', () => {
    expect(parseBirthdate('29.02.2024', { heute: HEUTE })).toEqual({ ok: true, ddmmyyyy: '29022024' });
  });

  it('29.02.2023 (kein Schaltjahr) ist datum_ungueltig', () => {
    expect(parseBirthdate('29.02.2023', { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_ungueltig' });
  });

  it('31.04.2010 (April hat nur 30 Tage) ist datum_ungueltig', () => {
    expect(parseBirthdate('31.04.2010', { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_ungueltig' });
  });

  it('heute selbst ist gueltig (Grenzwert, nicht nur gestern)', () => {
    const heuteAlsString = '08.10.2026';
    expect(parseBirthdate(heuteAlsString, { heute: HEUTE })).toEqual({ ok: true, ddmmyyyy: '08102026' });
  });

  it('morgen ist datum_zukunft (Grenzwert, nicht erst in einem Jahr)', () => {
    expect(parseBirthdate('09.10.2026', { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_zukunft' });
  });
});

describe('parseBirthdate — nicht parsebare Eingaben', () => {
  it("'nichtdatum' -> datum_format", () => {
    expect(parseBirthdate('nichtdatum', { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_format' });
  });

  it("'32.01.2010' (Tag ausserhalb des Regex-Rahmens trifft trotzdem, aber kalendarisch falsch) -> datum_ungueltig", () => {
    expect(parseBirthdate('32.01.2010', { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_ungueltig' });
  });

  it("'01/01/2010' (falsches Trennzeichen) -> datum_format", () => {
    expect(parseBirthdate('01/01/2010', { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_format' });
  });

  it('leerer String -> datum_format', () => {
    expect(parseBirthdate('', { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_format' });
  });

  it('nicht-String-Eingabe (null) wirft nicht und liefert datum_format', () => {
    expect(() => parseBirthdate(null, { heute: HEUTE })).not.toThrow();
    expect(parseBirthdate(null, { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_format' });
  });

  it('nicht-String-Eingabe (undefined) wirft nicht und liefert datum_format', () => {
    expect(parseBirthdate(undefined, { heute: HEUTE })).toEqual({ ok: false, messageId: 'datum_format' });
  });
});

describe('parseBirthdate — heute ist injizierbar statt vom echten Systemdatum abhaengig', () => {
  it('derselbe Eingabestring ist gueltig oder datum_zukunft, je nach injiziertem heute', () => {
    const vergangenheit = new Date(2030, 0, 1);
    const zukunft = new Date(2000, 0, 1);
    expect(parseBirthdate('01.01.2010', { heute: vergangenheit }).ok).toBe(true);
    expect(parseBirthdate('01.01.2010', { heute: zukunft })).toEqual({ ok: false, messageId: 'datum_zukunft' });
  });

  it('ohne heute-Option faellt auf das echte Systemdatum zurueck (wirft nicht, ein klar vergangenes Datum bleibt gueltig)', () => {
    expect(() => parseBirthdate('01.01.2000')).not.toThrow();
    expect(parseBirthdate('01.01.2000').ok).toBe(true);
  });

  it('die Uhrzeit von heute spielt keine Rolle, nur das Kalenderdatum (00:00 vs 23:59 am selben Tag)', () => {
    const spaetAmTag = new Date(2026, 9, 8, 23, 59, 59);
    expect(parseBirthdate('08.10.2026', { heute: spaetAmTag })).toEqual({ ok: true, ddmmyyyy: '08102026' });
  });
});
