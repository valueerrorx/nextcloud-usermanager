// S09 A4: Stufen 10-18 (ARCHITECTURE §6/§6.1). Die vier Pflichtfaelle, die
// username_nach_kuerzung_nicht_eindeutig/benutzer_existiert_bereits-Unterscheidung, der
// Re-Import-Beweis, der Stufe-18-Beweis und die Validierung am finalen String.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { buildImportPlan } from '../src/shared/importPlan.js';
import { parseImportCsv } from '../src/shared/csvImport.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
function rowsFromFixture(name) {
  const result = parseImportCsv(readFileSync(join(FIXTURES, name), 'utf8'));
  expect(result.ok).toBe(true); // Fixture muss selbst fehlerfrei durch Stufen 1-9 kommen
  return result.rows;
}

const BASIS = { serverUserIds: [], order: 'givenFirst', prefix: 'Schule', max: 20 };

describe('buildImportPlan — Fall 1 aus §6.1 (import-kuerzung-gleich-max20.csv, max=20)', () => {
  const rows = rowsFromFixture('import-kuerzung-gleich-max20.csv');
  const plan = buildImportPlan({ ...BASIS, rows });

  it('Zeile 1: neu + gekuerzt, kandidatA ann.bergmannschneide', () => {
    expect(plan.rows[0]).toMatchObject({ status: 'neu', username: 'ann.bergmannschneide', gekuerzt: true });
  });

  it('Zeile 2: kollision_aufgeloest + gekuerzt, kandidatB ann.bergman.02022011 (Suffix vollstaendig erhalten)', () => {
    expect(plan.rows[1]).toMatchObject({ status: 'kollision_aufgeloest', username: 'ann.bergman.02022011', gekuerzt: true });
    expect(plan.rows[1].username.length).toBe(20);
  });

  it('Zeile 3: username_nach_kuerzung_nicht_eindeutig (nicht benutzer_existiert_bereits), kandidatB bereits von Zeile 2 belegt', () => {
    expect(plan.rows[2]).toMatchObject({
      status: 'fehler',
      fehlerId: 'username_nach_kuerzung_nicht_eindeutig',
      username: 'ann.bergman.02022011',
    });
  });

  it('summary.neu + summary.kollisionAufgeloest + summary.fehler === rows.length', () => {
    expect(plan.summary.neu + plan.summary.kollisionAufgeloest + plan.summary.fehler).toBe(plan.rows.length);
    expect(plan.summary).toEqual({ neu: 1, kollisionAufgeloest: 1, fehler: 1 });
  });
});

describe('buildImportPlan — dieselbe Fall-1-Struktur bei max=64 (Produktionskonstante, import-kuerzung-gleich-max64.csv)', () => {
  const rows = rowsFromFixture('import-kuerzung-gleich-max64.csv');
  // kein max angegeben -> Default MAX_USERID = 64
  const plan = buildImportPlan({ serverUserIds: [], order: 'givenFirst', prefix: 'Schule', rows });

  it('Zeile 1: neu + gekuerzt, Username ist genau 64 Zeichen lang', () => {
    expect(plan.rows[0].status).toBe('neu');
    expect(plan.rows[0].gekuerzt).toBe(true);
    expect(plan.rows[0].username.length).toBe(64);
  });

  it('Zeile 2: kollision_aufgeloest + gekuerzt, Suffix .02022011 vollstaendig erhalten', () => {
    expect(plan.rows[1].status).toBe('kollision_aufgeloest');
    expect(plan.rows[1].username.endsWith('.02022011')).toBe(true);
  });

  it('Zeile 3: username_nach_kuerzung_nicht_eindeutig', () => {
    expect(plan.rows[2]).toMatchObject({ status: 'fehler', fehlerId: 'username_nach_kuerzung_nicht_eindeutig' });
  });
});

describe('buildImportPlan — Fall 2 aus §6.1 isoliert: Suffix bleibt erhalten, nur der Nachname schrumpft, beide order', () => {
  const rows = [
    { zeile: 1, vorname: 'Ann', nachname: 'Bergmannschneider', geburtsdatum: '02.02.2011' },
    { zeile: 2, vorname: 'Ann', nachname: 'Bergmannschneiderhuber', geburtsdatum: '02.02.2011' },
  ];

  it("givenFirst: Zeile 2 -> 'ann.bergman.02022011', exakt max Zeichen lang", () => {
    const plan = buildImportPlan({ ...BASIS, rows, order: 'givenFirst' });
    expect(plan.rows[1]).toMatchObject({ status: 'kollision_aufgeloest', username: 'ann.bergman.02022011' });
    expect(plan.rows[1].username.length).toBe(20);
  });

  it("surnameFirst: Zeile 2 -> 'bergman.ann.02022011', dasselbe gekuerzte second, nur anders zusammengesetzt", () => {
    const plan = buildImportPlan({ ...BASIS, rows, order: 'surnameFirst' });
    expect(plan.rows[1]).toMatchObject({ status: 'kollision_aufgeloest', username: 'bergman.ann.02022011' });
    expect(plan.rows[1].username.length).toBe(20);
  });
});

describe('buildImportPlan — Fall 3 aus §6.1: Re-Import derselben Datei ist beweisbar sauber', () => {
  const rows = rowsFromFixture('import-kuerzung-gleich-max20.csv');
  const lauf1 = buildImportPlan({ ...BASIS, rows });
  const erzeugteNamen = lauf1.rows.filter((r) => r.status !== 'fehler').map((r) => r.username);
  const lauf2 = buildImportPlan({ ...BASIS, rows, serverUserIds: erzeugteNamen });

  it('Lauf 1 erzeugt genau die aus der Tabelle erwarteten zwei Namen', () => {
    expect(erzeugteNamen).toEqual(['ann.bergmannschneide', 'ann.bergman.02022011']);
  });

  it('Lauf 2: beide in Lauf 1 angelegten Zeilen werden benutzer_existiert_bereits', () => {
    expect(lauf2.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits' });
    expect(lauf2.rows[1]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits' });
  });

  // ARCHITECTURE §6.1 Fall 3 wörtlich: "jede Zeile benutzer_existiert_bereits schon in Stufe 13".
  // Zeile 3 teilt denselben kandidatA wie Zeile 1 ('ann.bergmannschneide'); der ist jetzt ein
  // Server-User, also faengt Stufe 13 Zeile 3 ab, bevor Stufe 14f (ihr eigener Fehler aus Lauf 1)
  // ueberhaupt erreicht wird. Das ist kein Widerspruch: "ihre eigene Fehler-ID" gilt nur fuer
  // Zeilen, die schon VOR Stufe 13 scheiterten (datum_format, vorname_leer, ...) — Zeile 3 scheiterte
  // in Lauf 1 erst danach, an Stufe 14f.
  it('Lauf 2: auch Zeile 3 wird benutzer_existiert_bereits, schon in Stufe 13 (gleicher kandidatA wie Zeile 1)', () => {
    expect(lauf2.rows[2]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits', username: 'ann.bergmannschneide' });
  });

  it('Lauf 2: kein einziger kollision_aufgeloest, summary.neu + summary.kollisionAufgeloest === 0', () => {
    expect(lauf2.rows.some((r) => r.status === 'kollision_aufgeloest')).toBe(false);
    expect(lauf2.summary.neu + lauf2.summary.kollisionAufgeloest).toBe(0);
  });

  it('eine Zeile, die schon VOR Stufe 13 scheitert (vorname_leer), behaelt ihre eigene Fehler-ID unveraendert, egal was im Server-Set steht', () => {
    const rowsMitFruehemFehler = [{ zeile: 1, vorname: '', nachname: 'Mueller', geburtsdatum: '01.01.2000', fehler: 'vorname_leer' }];
    const ohneServer = buildImportPlan({ ...BASIS, rows: rowsMitFruehemFehler });
    const mitServer = buildImportPlan({ ...BASIS, rows: rowsMitFruehemFehler, serverUserIds: ['irgendwer', 'max.mueller'] });
    expect(ohneServer.rows[0].fehlerId).toBe('vorname_leer');
    expect(mitServer.rows[0].fehlerId).toBe('vorname_leer');
  });
});

describe('buildImportPlan — Fall 4 aus §6.1: Nachname kann nicht genug gekuerzt werden', () => {
  it('ohne Suffix: first=19 Zeichen bei max=20 -> username_zu_lang direkt in Stufe 12, kein Kandidat', () => {
    const rows = [{ zeile: 1, vorname: 'a'.repeat(19), nachname: 'Mueller', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'username_zu_lang', username: null, gekuerzt: false });
  });

  it('mit Suffix (nach einer Datei-Kollision): Stufe 12 passt noch, Stufe 14c schlaegt fehl -> username_zu_lang', () => {
    const first = 'a'.repeat(15); // budget ohne Suffix = 20-15-1 = 4 (passt), mit Suffix = 20-15-1-9 = -5 (passt nicht)
    const rows = [
      { zeile: 1, vorname: first, nachname: 'Mueller', geburtsdatum: '01.01.2000' },
      { zeile: 2, vorname: first, nachname: 'Mueller', geburtsdatum: '02.02.2000' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows[0].status).toBe('neu'); // kandidatA passt und ist frei
    expect(plan.rows[1]).toMatchObject({ status: 'fehler', fehlerId: 'username_zu_lang' });
    expect(plan.rows[1].username).toBe(plan.rows[0].username); // kandidatA war identisch, nur das Suffix scheiterte
  });
});

describe('username_nach_kuerzung_nicht_eindeutig ≠ benutzer_existiert_bereits (S09 Abnahme 6)', () => {
  it('gleiche identitaet (nur andere Schreibweise derselben Person) -> benutzer_existiert_bereits, kein Suffix-Versuch', () => {
    const rows = [
      { zeile: 1, vorname: 'Anna Maria', nachname: 'Musterfrau', geburtsdatum: '01.01.2000' },
      { zeile: 2, vorname: 'AnnaMaria', nachname: 'Musterfrau', geburtsdatum: '01.01.2000' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0].status).toBe('neu');
    expect(plan.rows[1]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits', username: plan.rows[0].username });
  });

  it('verschiedene identitaet, nach Kuerzung derselbe Name -> username_nach_kuerzung_nicht_eindeutig', () => {
    // Direkte Wiederholung von Fall 1 Zeile 3, isoliert ohne die anderen beiden Zeilen.
    const rows = [
      { zeile: 1, vorname: 'Ann', nachname: 'Bergmannschneider', geburtsdatum: '02.02.2011' },
      { zeile: 2, vorname: 'Ann', nachname: 'Bergmannschneiderhuber', geburtsdatum: '02.02.2011' },
      { zeile: 3, vorname: 'Ann', nachname: 'Bergmannschneidermeier', geburtsdatum: '02.02.2011' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows[2]).toMatchObject({ status: 'fehler', fehlerId: 'username_nach_kuerzung_nicht_eindeutig' });
  });
});

describe('Stufe-18-Beweis: eine Fehlerzeile belegt keinen Namen (S09 Abnahme 7)', () => {
  it('Zeile 1 scheitert vor jeder Kandidatenbildung (datum_ungueltig) — Zeile 2 mit demselben erzeugbaren Namen wird neu, nicht kollision_aufgeloest', () => {
    const rows = [
      { zeile: 1, vorname: 'Max', nachname: 'Mueller', geburtsdatum: '32.01.2000' },
      { zeile: 2, vorname: 'Max', nachname: 'Mueller', geburtsdatum: '01.01.2000' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'datum_ungueltig', username: null });
    expect(plan.rows[1]).toMatchObject({ status: 'neu', username: 'max.mueller' });
  });

  it('Zeile 1 scheitert erst in Stufe 15 (reserviert) — Zeile 2 mit identischem Kandidaten scheitert erneut an Stufe 15, statt faelschlich ueber die Kollisionsaufloesung zu laufen', () => {
    // 'Owncloud'+'Log' normalisiert zu 'owncloud.log', einem reservierten Namen (ARCHITECTURE §6 Stufe 15).
    const rows = [
      { zeile: 1, vorname: 'Owncloud', nachname: 'Log', geburtsdatum: '01.01.2000' },
      { zeile: 2, vorname: 'Owncloud', nachname: 'Log', geburtsdatum: '02.02.2000' }, // andere identitaet
    ];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'username_reserviert', username: 'owncloud.log' });
    // Waere Zeile 1 faelschlich registriert worden, wuerde Zeile 2 ueber Stufe 14c ein Suffix anhaengen
    // und kollision_aufgeloest liefern statt erneut an Stufe 15 zu scheitern.
    expect(plan.rows[1]).toMatchObject({ status: 'fehler', fehlerId: 'username_reserviert', username: 'owncloud.log' });
  });
});

describe('Stufe 15: Validierung am finalen String, nicht vorher (S09 Abnahme 8)', () => {
  it('reservierter Name ist ueber den Generator erreichbar (Owncloud/Log -> owncloud.log)', () => {
    const rows = [{ zeile: 1, vorname: 'Owncloud', nachname: 'Log', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'username_reserviert' });
  });

  it('ein mit einem groesseren max als MAX_USERID gebildeter Kandidat scheitert trotzdem an der defensiven 64-Zeichen-Grenze aus Stufe 15', () => {
    // max=100 laesst truncateToFit einen 92 Zeichen langen Kandidaten durch (passt:true); erst der
    // am finalen String laufende Validator (Stufe 15, feste MAX_USERID=64) faengt ihn ab.
    const rows = [{ zeile: 1, vorname: 'A', nachname: 'b'.repeat(90), geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 100 });
    expect(plan.rows[0].username).toBe(`a.${'b'.repeat(90)}`);
    expect(plan.rows[0].username.length).toBe(92);
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'username_zu_lang' });
  });
});

describe('buildImportPlan — Stufe 13: Kollision mit bestehendem Nextcloud-User ist ein harter Fehler', () => {
  it('kandidatA ist bereits ein bestehender Server-User -> benutzer_existiert_bereits, nichts wird aufgeloest', () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Mueller', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, serverUserIds: ['max.mueller'], max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits', username: 'max.mueller', gekuerzt: false });
  });

  it('Vergleich ist case-insensitiv (DECISIONS)', () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Mueller', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, serverUserIds: ['MAX.MUELLER'], max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits' });
  });
});

describe('buildImportPlan — Stufe 10: name_nicht_abbildbar', () => {
  it('nicht-lateinische Schrift normalisiert zu leer -> name_nicht_abbildbar, kein Kandidat', () => {
    const rows = [{ zeile: 1, vorname: '李', nachname: '四', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'name_nicht_abbildbar', username: null });
  });

  it('Komponente normalisiert zu nur Punkten gilt ebenfalls als name_nicht_abbildbar (DECISIONS)', () => {
    const rows = [{ zeile: 1, vorname: '...', nachname: 'Mueller', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'name_nicht_abbildbar' });
  });
});

describe('buildImportPlan — Reihenfolge-Schalter order', () => {
  it("surnameFirst setzt den Nachnamen vor den Vornamen im Username, displayname bleibt Vorname Nachname", () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Müller', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, order: 'surnameFirst', max: 64 });
    expect(plan.rows[0].username).toBe('mueller.max');
    expect(plan.rows[0].displayname).toBe('Max Müller');
  });

  it('unbekannter order-Wert faellt auf givenFirst zurueck (normalizeOrder)', () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Müller', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, order: 'nope', max: 64 });
    expect(plan.rows[0].username).toBe('max.mueller');
  });
});

describe('buildImportPlan — Zeilen aus parseImportCsv mit vorhandenem Zeilenfehler verlassen die Pipeline sofort', () => {
  it('ein RawRow mit fehler aus Stufe 1-9 wird unveraendert zu einer Fehlerzeile, kein ddmmyyyy, kein Kandidat', () => {
    const rows = [{ zeile: 5, vorname: '', nachname: 'Mueller', geburtsdatum: '', fehler: 'vorname_leer' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({
      zeile: 5,
      status: 'fehler',
      fehlerId: 'vorname_leer',
      username: null,
      ddmmyyyy: null,
      gekuerzt: false,
      passwort: null,
    });
  });
});

describe('buildImportPlan — Passwort und displayname', () => {
  it('eine erfolgreiche Zeile bekommt genau buildInitialPassword(prefix, ddmmyyyy) als Passwort', () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Mueller', geburtsdatum: '01.01.2000' }];
    const plan = buildImportPlan({ ...BASIS, rows, prefix: 'Schule', max: 64 });
    expect(plan.rows[0].passwort).toBe('Schule01012000!');
  });

  it('eine Fehlerzeile hat passwort: null', () => {
    const rows = [{ zeile: 1, vorname: '', nachname: '', geburtsdatum: '', fehler: 'vorname_leer' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0].passwort).toBeNull();
  });
});

describe('summary.neu + summary.kollisionAufgeloest + summary.fehler === rows.length (S09 Abnahme 10)', () => {
  it('gilt auch fuer eine gemischte Zeilenmenge', () => {
    const rows = [
      { zeile: 1, vorname: 'Max', nachname: 'Mueller', geburtsdatum: '01.01.2000' },
      { zeile: 2, vorname: 'Max', nachname: 'Mueller', geburtsdatum: '02.02.2000' },
      { zeile: 3, vorname: '', nachname: '', geburtsdatum: '', fehler: 'vorname_leer' },
      { zeile: 4, vorname: '李', nachname: '四', geburtsdatum: '01.01.2000' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.summary.neu + plan.summary.kollisionAufgeloest + plan.summary.fehler).toBe(plan.rows.length);
    expect(plan.rows.length).toBe(4);
  });
});

describe('buildImportPlan ist pur (S09 Abnahme 9)', () => {
  it('ruft nie fetch auf, auch nicht ueber die Kollisionsaufloesung', () => {
    const throwingFetch = vi.fn(() => {
      throw new Error('importPlan.js must never perform network I/O');
    });
    vi.stubGlobal('fetch', throwingFetch);
    try {
      const rows = rowsFromFixture('import-kuerzung-gleich-max20.csv');
      buildImportPlan({ ...BASIS, rows });
      expect(throwingFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
