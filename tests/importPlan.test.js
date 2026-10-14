// Stufen 10-18 (ARCHITECTURE §6/§6.1): Zaehlersuffix, Kuerzung, Re-Import, Stufe 15/18, Passwort 1:1.
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

const BASIS = { serverUserIds: [], order: 'givenFirst', max: 20 };

describe('buildImportPlan — Fall 4 aus §6.1: Nachname kann nicht genug gekuerzt werden', () => {
  it('ohne Suffix: first=19 Zeichen bei max=20 -> username_zu_lang direkt in Stufe 12, kein Kandidat', () => {
    const rows = [{ zeile: 1, vorname: 'a'.repeat(19), nachname: 'Mueller', passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'username_zu_lang', username: null, gekuerzt: false });
  });

  it('mit Suffix (nach einer Datei-Kollision): Basis passt noch, Zaehlersuffix schlaegt fehl -> username_zu_lang', () => {
    const first = 'a'.repeat(17); // budget ohne Suffix = 20-17-1 = 2 (passt), mit Suffix '.2' = 0 (passt nicht)
    const rows = [
      { zeile: 1, vorname: first, nachname: 'Mueller', passwort: 'A' },
      { zeile: 2, vorname: first, nachname: 'Mueller', passwort: 'B' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows[0].status).toBe('neu'); // kandidatA passt und ist frei
    expect(plan.rows[1]).toMatchObject({ status: 'fehler', fehlerId: 'username_zu_lang' });
    expect(plan.rows[1].username).toBe(plan.rows[0].username); // Basis-Kandidat, nur das Suffix scheiterte
  });
});

describe('Stufe-18-Beweis: eine Fehlerzeile belegt keinen Namen (S09 Abnahme 7)', () => {
  it('Zeile 1 scheitert vor jeder Kandidatenbildung (vorname_leer) — Zeile 2 mit demselben erzeugbaren Namen wird neu, nicht kollision_aufgeloest', () => {
    const rows = [
      { zeile: 1, vorname: '', nachname: 'Mueller', passwort: 'A', fehler: 'vorname_leer' },
      { zeile: 2, vorname: 'Max', nachname: 'Mueller', passwort: 'A' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'vorname_leer', username: null });
    expect(plan.rows[1]).toMatchObject({ status: 'neu', username: 'max.mueller' });
  });

  it('Zeile 1 scheitert erst in Stufe 15 (reserviert) — Zeile 2 mit identischem Kandidaten scheitert erneut an Stufe 15, statt faelschlich ueber die Kollisionsaufloesung zu laufen', () => {
    // 'Nextcloud'+'Log' normalisiert zu 'nextcloud.log', einem reservierten Namen (ARCHITECTURE §6 Stufe 15).
    const rows = [
      { zeile: 1, vorname: 'Nextcloud', nachname: 'Log', passwort: 'A' },
      { zeile: 2, vorname: 'Nextcloud', nachname: 'Log', passwort: 'B' },
    ];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'username_reserviert', username: 'nextcloud.log' });
    // Waere Zeile 1 faelschlich registriert worden, wuerde Zeile 2 ein Zaehlersuffix bekommen
    // und kollision_aufgeloest liefern statt erneut an Stufe 15 zu scheitern.
    expect(plan.rows[1]).toMatchObject({ status: 'fehler', fehlerId: 'username_reserviert', username: 'nextcloud.log' });
  });
});

describe('Stufe 15: Validierung am finalen String, nicht vorher (S09 Abnahme 8)', () => {
  it('ein mit einem groesseren max als MAX_USERID gebildeter Kandidat scheitert trotzdem an der defensiven 64-Zeichen-Grenze aus Stufe 15', () => {
    // max=100 laesst truncateToFit einen 92 Zeichen langen Kandidaten durch (passt:true); erst der
    // am finalen String laufende Validator (Stufe 15, feste MAX_USERID=64) faengt ihn ab.
    const rows = [{ zeile: 1, vorname: 'A', nachname: 'b'.repeat(90), passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 100 });
    expect(plan.rows[0].username).toBe(`a.${'b'.repeat(90)}`);
    expect(plan.rows[0].username.length).toBe(92);
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'username_zu_lang' });
  });
});

describe('buildImportPlan — Stufe 13: Kollision mit bestehendem Nextcloud-User ist ein harter Fehler', () => {
  it('kandidatA ist bereits ein bestehender Server-User -> benutzer_existiert_bereits, nichts wird aufgeloest', () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Mueller', passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows, serverUserIds: ['max.mueller'], max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits', username: 'max.mueller', gekuerzt: false });
  });

  it('Vergleich ist case-insensitiv (DECISIONS)', () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Mueller', passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows, serverUserIds: ['MAX.MUELLER'], max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits' });
  });
});

describe('buildImportPlan — Stufe 10: name_nicht_abbildbar', () => {
  it('nicht-lateinische Schrift normalisiert zu leer -> name_nicht_abbildbar, kein Kandidat', () => {
    const rows = [{ zeile: 1, vorname: '李', nachname: '四', passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'name_nicht_abbildbar', username: null });
  });

  it('Komponente normalisiert zu nur Punkten gilt ebenfalls als name_nicht_abbildbar (DECISIONS)', () => {
    const rows = [{ zeile: 1, vorname: '...', nachname: 'Mueller', passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({ status: 'fehler', fehlerId: 'name_nicht_abbildbar' });
  });
});

describe('buildImportPlan — Reihenfolge-Schalter order', () => {
  it("surnameFirst setzt den Nachnamen vor den Vornamen im Username, displayname bleibt Vorname Nachname", () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Müller', passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows, order: 'surnameFirst', max: 64 });
    expect(plan.rows[0].username).toBe('mueller.max');
    expect(plan.rows[0].displayname).toBe('Max Müller');
  });

  it('unbekannter order-Wert faellt auf givenFirst zurueck (normalizeOrder)', () => {
    const rows = [{ zeile: 1, vorname: 'Max', nachname: 'Müller', passwort: 'A' }];
    const plan = buildImportPlan({ ...BASIS, rows, order: 'nope', max: 64 });
    expect(plan.rows[0].username).toBe('max.mueller');
  });
});

describe('buildImportPlan — Zeilen aus parseImportCsv mit vorhandenem Zeilenfehler verlassen die Pipeline sofort', () => {
  it('ein RawRow mit fehler aus Stufe 1-9 wird unveraendert zu einer Fehlerzeile, kein Kandidat', () => {
    const rows = [{ zeile: 5, vorname: '', nachname: 'Mueller', passwort: '', fehler: 'vorname_leer' }];
    const plan = buildImportPlan({ ...BASIS, rows, max: 64 });
    expect(plan.rows[0]).toMatchObject({
      zeile: 5,
      status: 'fehler',
      fehlerId: 'vorname_leer',
      username: null,
      gekuerzt: false,
      passwort: null,
    });
  });
});

const R = (zeile, vorname, nachname, passwort) => ({ zeile, vorname, nachname, passwort });

describe('buildImportPlan — Passwort 1:1 und Zaehlersuffix', () => {
  it('Passwort wird unveraendert uebernommen, auch Datumsform und Sonderzeichen', () => {
    const werte = ['1234', '01.01.2000', 'Ab!c d', 'äöü€', 'a""b'];
    const plan = buildImportPlan({ ...BASIS, max: 64, rows: werte.map((w, i) => R(i + 1, `Max${String.fromCharCode(97 + i)}`, 'Mueller', w)) });
    expect(plan.rows.map((r) => r.passwort)).toEqual(werte);
  });

  it('import-kollision-zaehler.csv: max.mueller, .2, .3 mit Status neu, kollision_aufgeloest, kollision_aufgeloest', () => {
    const plan = buildImportPlan({ ...BASIS, max: 64, rows: rowsFromFixture('import-kollision-zaehler.csv') });
    expect(plan.rows.map((r) => [r.username, r.status])).toEqual([
      ['max.mueller', 'neu'], ['max.mueller.2', 'kollision_aufgeloest'], ['max.mueller.3', 'kollision_aufgeloest'],
    ]);
  });

  it('surnameFirst haengt den Zaehler hinten an', () => {
    const plan = buildImportPlan({ ...BASIS, max: 64, order: 'surnameFirst', rows: rowsFromFixture('import-kollision-zaehler.csv') });
    expect(plan.rows.map((r) => r.username)).toEqual(['mueller.max', 'mueller.max.2', 'mueller.max.3']);
  });

  it('anderes Passwort-Casing bei gleichem Namen bekommt .2', () => {
    const plan = buildImportPlan({ ...BASIS, max: 64, rows: [R(1, 'Max', 'Mueller', 'A'), R(2, 'MAX', 'mueller', 'a')] });
    expect(plan.rows[1]).toMatchObject({ username: 'max.mueller.2', status: 'kollision_aufgeloest' });
  });

  it('Nachname Mueller.2 belegt max.mueller.2: Zaehler ueberspringt den belegten Namen', () => {
    const rows = [R(1, 'Max', 'Mueller.2', 'a'), R(2, 'Max', 'Mueller', 'b'), R(3, 'Max', 'Mueller', 'c')];
    const plan = buildImportPlan({ ...BASIS, max: 64, rows });
    expect(plan.rows.map((r) => r.username)).toEqual(['max.mueller.2', 'max.mueller', 'max.mueller.3']);
  });

  it('Server kennt max.mueller -> alle drei Zeilen benutzer_existiert_bereits', () => {
    const rows = [R(1, 'Max', 'Mueller', 'a'), R(2, 'Max', 'Mueller', 'b'), R(3, 'Max', 'Mueller', 'c')];
    const plan = buildImportPlan({ ...BASIS, max: 64, rows, serverUserIds: ['max.mueller'] });
    expect(plan.rows.map((r) => r.fehlerId)).toEqual(Array(3).fill('benutzer_existiert_bereits'));
  });

  it('Server kennt nur max.mueller.2 -> Zeile 1 neu, Zeilen 2 und 3 Fehler mit username max.mueller.2 (kein Weiterzaehlen)', () => {
    const rows = [R(1, 'Max', 'Mueller', 'a'), R(2, 'Max', 'Mueller', 'b'), R(3, 'Max', 'Mueller', 'c')];
    const plan = buildImportPlan({ ...BASIS, max: 64, rows, serverUserIds: ['max.mueller.2'] });
    expect(plan.rows[0].status).toBe('neu');
    for (const r of plan.rows.slice(1)) {
      expect(r).toMatchObject({ status: 'fehler', fehlerId: 'benutzer_existiert_bereits', username: 'max.mueller.2' });
    }
  });

  it('Re-Import: alle zuvor angelegten Zeilen werden benutzer_existiert_bereits', () => {
    const rows = rowsFromFixture('import-kollision-zaehler.csv');
    const lauf1 = buildImportPlan({ ...BASIS, max: 64, rows });
    const lauf2 = buildImportPlan({ ...BASIS, max: 64, rows, serverUserIds: lauf1.rows.map((r) => r.username) });
    expect(lauf2.rows.map((r) => r.fehlerId)).toEqual(Array(3).fill('benutzer_existiert_bereits'));
  });
});

describe('buildImportPlan — Kuerzung mit Zaehlersuffix', () => {
  it('import-kuerzung-gleich-max20.csv: ann.bergmannschneide, ann.bergmannschnei.2, ann.bergmannschnei.3', () => {
    const plan = buildImportPlan({ ...BASIS, rows: rowsFromFixture('import-kuerzung-gleich-max20.csv') });
    expect(plan.rows.map((r) => [r.username, r.status, r.gekuerzt])).toEqual([
      ['ann.bergmannschneide', 'neu', true],
      ['ann.bergmannschnei.2', 'kollision_aufgeloest', true],
      ['ann.bergmannschnei.3', 'kollision_aufgeloest', true],
    ]);
  });

  it('import-kuerzung-gleich-max64.csv: Basis 64 Zeichen, .2 und .3 ebenfalls genau 64', () => {
    const plan = buildImportPlan({ serverUserIds: [], order: 'givenFirst', rows: rowsFromFixture('import-kuerzung-gleich-max64.csv') });
    expect(plan.rows.map((r) => r.username)).toEqual([
      `ann.${'b'.repeat(60)}`, `ann.${'b'.repeat(58)}.2`, `ann.${'b'.repeat(58)}.3`,
    ]);
    expect(plan.rows.every((r) => r.username.length === 64)).toBe(true);
  });

  it('zehn gleichnamige Zeilen: n=9 -> ann.bergmannschnei.9, n=10 -> ann.bergmannschne.10, alle 20 Zeichen', () => {
    const rows = Array.from({ length: 10 }, (_, i) => R(i + 1, 'Ann', 'Bergmannschneider', `p${i}`));
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows[8].username).toBe('ann.bergmannschnei.9');
    expect(plan.rows[9].username).toBe('ann.bergmannschne.10');
    expect(plan.rows.every((r) => r.username.length === 20)).toBe(true);
    expect(plan.rows.every((r) => r.gekuerzt === true)).toBe(true);
  });

  it('max=20, Vorname 16 Zeichen: .2-.9 passen, Zeile 10 (.10) ist username_zu_lang mit Basis-Kandidat als username', () => {
    const vor = 'a'.repeat(16);
    const rows = Array.from({ length: 10 }, (_, i) => R(i + 1, vor, 'Mueller', `p${i}`));
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows[0]).toMatchObject({ username: `${vor}.mue`, status: 'neu', gekuerzt: true });
    for (let n = 2; n <= 9; n += 1) {
      expect(plan.rows[n - 1]).toMatchObject({ username: `${vor}.m.${n}`, status: 'kollision_aufgeloest', gekuerzt: true });
    }
    expect(plan.rows[9]).toMatchObject({ status: 'fehler', fehlerId: 'username_zu_lang', username: `${vor}.mue` });
  });

  it('Server kennt den gekuerzten .2-Kandidaten -> Fehlerzeile mit gekuerztem .2-Username und gekuerzt=true', () => {
    const rows = [R(1, 'Ann', 'Bergmannschneider', 'x'), R(2, 'Ann', 'Bergmannschneider', 'y')];
    const plan = buildImportPlan({ ...BASIS, rows, serverUserIds: ['ann.bergmannschnei.2'] });
    expect(plan.rows[0]).toMatchObject({ username: 'ann.bergmannschneide', status: 'neu' });
    expect(plan.rows[1]).toMatchObject({
      status: 'fehler', fehlerId: 'benutzer_existiert_bereits', username: 'ann.bergmannschnei.2', gekuerzt: true,
    });
  });
});

describe('buildImportPlan — Passwort-Spalte aus geparster CSV (S20 AC10-AC12)', () => {
  const HEAD = 'Vorname;Nachname;Passwort\n';
  const parse = (body) => parseImportCsv(HEAD + body).rows;

  it('zwei gleichnamige Zeilen mit leerem Passwort -> beide passwort_leer', () => {
    const rows = parse('Max;Mueller;\nMax;Mueller;');
    expect(rows.map((r) => r.fehler)).toEqual(['passwort_leer', 'passwort_leer']);
    expect(buildImportPlan({ ...BASIS, rows }).rows.map((r) => [r.status, r.fehlerId])).toEqual([
      ['fehler', 'passwort_leer'], ['fehler', 'passwort_leer'],
    ]);
  });

  it('leer, dann A, dann A -> passwort_leer, ok, doppelzeile (leere Zeile registriert nichts)', () => {
    const rows = parse('Max;Mueller;\nMax;Mueller;A\nMax;Mueller;A');
    expect(rows.map((r) => r.fehler)).toEqual(['passwort_leer', undefined, 'doppelzeile']);
    const plan = buildImportPlan({ ...BASIS, rows });
    expect(plan.rows.map((r) => [r.status, r.fehlerId ?? null, r.username])).toEqual([
      ['fehler', 'passwort_leer', null],
      ['neu', null, 'max.mueller'],
      ['fehler', 'doppelzeile', null],
    ]);
  });

  it('8 Zeilen mit drei verschiedenen Passwort-Belegungen -> identische username/status, inkl. max.mueller.2.2', () => {
    const namen = [['Max', 'Mueller'], ['Max', 'Müller'], ['max', 'mueller'], ['Ann', 'Bergmannschneider'],
      ['Ann', 'Bergmannschneider'], ['nextcloud', 'log'], ['Max', 'Mueller.2'], ['Anna', 'Schmidt']];
    const lauf = (pws) => buildImportPlan({ ...BASIS, rows: namen.map(([v, n], i) => R(i + 1, v, n, pws[i])) })
      .rows.map((r) => [r.username, r.status]);
    const erwartet = [
      ['max.mueller', 'neu'], ['max.mueller.2', 'kollision_aufgeloest'], ['max.mueller.3', 'kollision_aufgeloest'],
      ['ann.bergmannschneide', 'neu'], ['ann.bergmannschnei.2', 'kollision_aufgeloest'],
      ['nextcloud.log', 'fehler'], ['max.mueller.2.2', 'kollision_aufgeloest'], ['anna.schmidt', 'neu'],
    ];
    expect(lauf(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'])).toEqual(erwartet);
    expect(lauf(['h8', 'g7', 'f6', 'e5', 'd4', 'c3', 'b2', 'a1'])).toEqual(erwartet);
    expect(lauf(['zz', 'Zz', '1234', '01.01.2000', '!', ' x', 'äöü', 'Max'])).toEqual(erwartet);
  });
});

describe('summary.neu + summary.kollisionAufgeloest + summary.fehler === rows.length (S09 Abnahme 10)', () => {
  it('gilt auch fuer eine gemischte Zeilenmenge', () => {
    const rows = [
      { zeile: 1, vorname: 'Max', nachname: 'Mueller', passwort: 'A' },
      { zeile: 2, vorname: 'Max', nachname: 'Mueller', passwort: 'B' },
      { zeile: 3, vorname: '', nachname: '', passwort: '', fehler: 'vorname_leer' },
      { zeile: 4, vorname: '李', nachname: '四', passwort: 'A' },
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
      const rows = rowsFromFixture('import-kollision-zaehler.csv');
      buildImportPlan({ ...BASIS, rows });
      expect(throwingFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
