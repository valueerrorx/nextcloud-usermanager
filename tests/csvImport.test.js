// S09 A3: Stufen 1-9 (ARCHITECTURE §6), je eine Fixture pro Datei-/Zeilenfehler, plus
// BOM/CRLF/Trennzeichen/Gleichstand und parseUserList.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseImportCsv, parseUserList, detectDelimiter } from '../src/shared/csvImport.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
function fixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('parseImportCsv — Dateifehler, je eine Fixture (ARCHITECTURE §6)', () => {
  it('import-leer.csv (komplett leer) -> datei_leer', () => {
    expect(parseImportCsv(fixture('import-leer.csv'))).toEqual({ ok: false, rows: [], fileError: 'datei_leer' });
  });

  it('import-nur-header.csv (nur Kopfzeile, keine Daten) -> nur_header', () => {
    expect(parseImportCsv(fixture('import-nur-header.csv'))).toEqual({ ok: false, rows: [], fileError: 'nur_header' });
  });

  it('import-header-falsch.csv (Spalte heisst nicht Vorname) -> header_fehlt', () => {
    expect(parseImportCsv(fixture('import-header-falsch.csv'))).toEqual({ ok: false, rows: [], fileError: 'header_fehlt' });
  });

  it('import-2001-zeilen.csv (2001 Datenzeilen, Grenzwert ueber 2000) -> zeilenlimit', () => {
    expect(parseImportCsv(fixture('import-2001-zeilen.csv'))).toEqual({ ok: false, rows: [], fileError: 'zeilenlimit' });
  });

  it('weder ; noch , im Header -> header_fehlt (beide Trennzeichen-Zaehler sind 0)', () => {
    expect(parseImportCsv('Vorname|Nachname|Passwort\nMax|Mueller|01.01.2000\n')).toEqual({
      ok: false,
      rows: [],
      fileError: 'header_fehlt',
    });
  });
});

describe('parseImportCsv — Zeilenfehler, je eine Fixture (ARCHITECTURE §6)', () => {
  it('import-spaltenzahl.csv: Zeile 2 hat nur 2 statt 3 Spalten -> spaltenzahl, Zeile 1 bleibt fehlerfrei', () => {
    const result = parseImportCsv(fixture('import-spaltenzahl.csv'));
    expect(result.ok).toBe(true);
    expect(result.rows[0].fehler).toBeUndefined();
    expect(result.rows[1]).toEqual({ zeile: 2, vorname: '', nachname: '', passwort: '', fehler: 'spaltenzahl' });
  });

  it('import-quote-unbalanciert.csv: unbalanciertes Anfuehrungszeichen -> quote_unbalanciert, nicht still verstuemmelt', () => {
    const result = parseImportCsv(fixture('import-quote-unbalanciert.csv'));
    expect(result.rows[0]).toEqual({ zeile: 1, vorname: '', nachname: '', passwort: '', fehler: 'quote_unbalanciert' });
  });

  it('import-vorname-leer.csv: Zeile 2 ohne Vorname -> vorname_leer', () => {
    const result = parseImportCsv(fixture('import-vorname-leer.csv'));
    expect(result.rows[1].fehler).toBe('vorname_leer');
  });

  it('import-nachname-leer.csv: Zeile 2 ohne Nachname -> nachname_leer', () => {
    const result = parseImportCsv(fixture('import-nachname-leer.csv'));
    expect(result.rows[1].fehler).toBe('nachname_leer');
  });

  it('import-passwort-leer.csv: leere und nur aus Leerzeichen bestehende Zelle -> passwort_leer', () => {
    const result = parseImportCsv(fixture('import-passwort-leer.csv'));
    expect(result.rows[0].fehler).toBeUndefined();
    expect(result.rows[1].fehler).toBe('passwort_leer');
    expect(result.rows[2].fehler).toBe('passwort_leer');
  });

  it('Passwort wird 1:1 uebernommen (nur aeusserer Trim), auch Datumsform, Sonderzeichen und gerade Anzahl Anfuehrungszeichen', () => {
    const werte = ['01.01.2000', '2000-01-01', 'Ab!c d', 'äöü€', 'a""b'];
    const text = `Vorname;Nachname;Passwort\n${werte.map((w, i) => `Max${i};Mueller; ${w} `).join('\n')}\n`;
    const result = parseImportCsv(text);
    expect(result.rows.map((r) => r.passwort)).toEqual(werte);
  });

  it('Passwort mit Trennzeichen -> spaltenzahl, mit einem " -> quote_unbalanciert', () => {
    const result = parseImportCsv('Vorname;Nachname;Passwort\nMax;Mueller;a;b\nMax;Mueller;a"b\n');
    expect(result.rows[0].fehler).toBe('spaltenzahl');
    expect(result.rows[1].fehler).toBe('quote_unbalanciert');
  });

  it('import-doppelzeile.csv: Zeile 2 ist Dublette von Zeile 1 (roh, getrimmt, case-insensitiv) -> doppelzeile, Zeile 3 bleibt fehlerfrei', () => {
    const result = parseImportCsv(fixture('import-doppelzeile.csv'));
    expect(result.rows[0].fehler).toBeUndefined();
    expect(result.rows[1].fehler).toBe('doppelzeile');
    expect(result.rows[2].fehler).toBeUndefined();
  });

  it('gleicher Name, anderes Passwort (auch nur andere Gross-/Kleinschreibung) ist keine Dublette', () => {
    const result = parseImportCsv('Vorname;Nachname;Passwort\nMax;Mueller;a\nMax;Mueller;A\n');
    expect(result.rows[1].fehler).toBeUndefined();
  });

  it("Passwort mit '|' verschmilzt nicht mit dem Namen im Dublettenschluessel", () => {
    const result = parseImportCsv('Vorname;Nachname;Passwort\nMax;Mueller;a|b\nMax;Mueller|a;b\n');
    expect(result.rows[1].fehler).toBeUndefined();
  });

  it("Stufe 9 vergleicht den Rohtext, nicht normalizeComponent: 'Anna Maria'/'AnnaMaria' bei gleichem Passwort ist KEINE Dublette", () => {
    const text = 'Vorname;Nachname;Passwort\nAnna Maria;Musterfrau;01.01.2000\nAnnaMaria;Musterfrau;01.01.2000\n';
    const result = parseImportCsv(text);
    expect(result.rows[0].fehler).toBeUndefined();
    expect(result.rows[1].fehler).toBeUndefined();
  });
});

describe('parseImportCsv — BOM, CRLF, Trennzeichenerkennung (S09 Abnahme 3)', () => {
  it('import-bom-crlf.csv: BOM wird entfernt und CRLF korrekt behandelt', () => {
    const result = parseImportCsv(fixture('import-bom-crlf.csv'));
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([{ zeile: 1, vorname: 'Max', nachname: 'Mueller', passwort: 'Pw1234' }]);
  });

  it('import-semikolon.csv: Trennzeichen ; wird erkannt', () => {
    const result = parseImportCsv(fixture('import-semikolon.csv'));
    expect(result.ok).toBe(true);
    expect(result.rows[0].vorname).toBe('Max');
  });

  it('import-komma.csv: Trennzeichen , wird erkannt', () => {
    const result = parseImportCsv(fixture('import-komma.csv'));
    expect(result.ok).toBe(true);
    expect(result.rows[0].vorname).toBe('Max');
  });

  it('import-ok.csv: zwei fehlerfreie Zeilen, ok:true', () => {
    const result = parseImportCsv(fixture('import-ok.csv'));
    expect(result).toEqual({
      ok: true,
      rows: [
        { zeile: 1, vorname: 'Max', nachname: 'Mueller', passwort: 'Pw1234' },
        { zeile: 2, vorname: 'Anna', nachname: 'Schmidt', passwort: 'Pw5678' },
      ],
    });
  });
});

describe('detectDelimiter — haeufigeres Zeichen gewinnt, Gleichstand -> ; (DECISIONS)', () => {
  it("nur ';' vorhanden -> ';'", () => {
    expect(detectDelimiter('Vorname;Nachname;Passwort')).toBe(';');
  });

  it("nur ',' vorhanden -> ','", () => {
    expect(detectDelimiter('Vorname,Nachname,Passwort')).toBe(',');
  });

  it("mehr ',' als ';' -> ','", () => {
    expect(detectDelimiter('a,b,c,d;e')).toBe(',');
  });

  it("mehr ';' als ',' -> ';'", () => {
    expect(detectDelimiter('a;b;c;d,e')).toBe(';');
  });

  it("Gleichstand (je 1) -> ';' (deutsches Excel)", () => {
    expect(detectDelimiter('a;b,c')).toBe(';');
  });

  it("Gleichstand (je 2) -> ';'", () => {
    expect(detectDelimiter('a;b;c,d,e')).toBe(';');
  });

  it('weder ; noch , -> null', () => {
    expect(detectDelimiter('VornameNachnamePasswort')).toBeNull();
  });
});

describe('parseUserList — ein Username pro Zeile, optionaler Header, Leerzeilen weg', () => {
  it('userliste-mit-header.csv: Header wird entfernt, Leerzeile wird entfernt', () => {
    expect(parseUserList(fixture('userliste-mit-header.csv'))).toEqual({
      ok: true,
      usernames: ['max.mueller', 'anna.schmidt'],
    });
  });

  it('userliste-ohne-header.csv: keine Kopfzeile, beide Zeilen bleiben Usernames', () => {
    expect(parseUserList(fixture('userliste-ohne-header.csv'))).toEqual({
      ok: true,
      usernames: ['max.mueller', 'anna.schmidt'],
    });
  });

  it('Header-Erkennung ist case-insensitiv (USERNAME wird auch als Header erkannt)', () => {
    expect(parseUserList('USERNAME\nmax.mueller\n')).toEqual({ ok: true, usernames: ['max.mueller'] });
  });

  it('eine Datei ohne jeden Inhalt liefert eine leere Liste, kein Fehler', () => {
    expect(parseUserList('')).toEqual({ ok: true, usernames: [] });
  });
});

describe('Kein I/O — csvImport.js ruft nie fetch auf', () => {
  it('parseImportCsv und parseUserList laufen durch, ohne den gestubbten fetch-Spy zu feuern', async () => {
    const { vi } = await import('vitest');
    const throwingFetch = vi.fn(() => {
      throw new Error('csvImport.js must never perform network I/O');
    });
    vi.stubGlobal('fetch', throwingFetch);
    try {
      parseImportCsv(fixture('import-ok.csv'));
      parseUserList(fixture('userliste-mit-header.csv'));
      expect(throwingFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
