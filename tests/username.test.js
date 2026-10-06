// S02 username.js: RESEARCH-UPN §1/§10/§11, truncateToFit, validateUserid. No I/O.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as username from '../src/shared/username.js';
import {
  MAX_USERID,
  RESERVED_USERIDS,
  normalizeOrder,
  normalizeComponent,
  buildUsername,
  truncateToFit,
  validateUserid,
} from '../src/shared/username.js';

// RESEARCH-UPN §11: all 14 rows, all four columns.
const TABLE_11 = [
  { vn: 'Max', nn: 'Mustermann', normVn: 'max', normNn: 'mustermann', givenFirst: 'max.mustermann', surnameFirst: 'mustermann.max' },
  { vn: 'Müller', nn: 'Lüdenscheidt', normVn: 'mueller', normNn: 'luedenscheidt', givenFirst: 'mueller.luedenscheidt', surnameFirst: 'luedenscheidt.mueller' },
  { vn: 'Anna Maria', nn: 'Musterfrau', normVn: 'annamaria', normNn: 'musterfrau', givenFirst: 'annamaria.musterfrau', surnameFirst: 'musterfrau.annamaria' },
  { vn: 'Björn', nn: 'Müller-Lüdenscheidt', normVn: 'bjoern', normNn: 'muellerluedenscheidt', givenFirst: 'bjoern.muellerluedenscheidt', surnameFirst: 'muellerluedenscheidt.bjoern' },
  { vn: 'Weiß', nn: 'Straße', normVn: 'weiss', normNn: 'strasse', givenFirst: 'weiss.strasse', surnameFirst: 'strasse.weiss' },
  { vn: "O'Brien", nn: 'Smith', normVn: 'obrien', normNn: 'smith', givenFirst: 'obrien.smith', surnameFirst: 'smith.obrien' },
  { vn: 'Jean-Luc', nn: 'Picard', normVn: 'jeanluc', normNn: 'picard', givenFirst: 'jeanluc.picard', surnameFirst: 'picard.jeanluc' },
  { vn: 'Ștefan', nn: 'Țăranu', normVn: 'stefan', normNn: 'taranu', givenFirst: 'stefan.taranu', surnameFirst: 'taranu.stefan' },
  { vn: 'René', nn: 'García', normVn: 'rene', normNn: 'garcia', givenFirst: 'rene.garcia', surnameFirst: 'garcia.rene' },
  { vn: 'ÄÖÜ', nn: 'SS', normVn: 'aeoeue', normNn: 'ss', givenFirst: 'aeoeue.ss', surnameFirst: 'ss.aeoeue' },
  { vn: 'anna', nn: 'MUSTERMANN', normVn: 'anna', normNn: 'mustermann', givenFirst: 'anna.mustermann', surnameFirst: 'mustermann.anna' },
  { vn: 'Mary Ann', nn: 'OConnor-Smith', normVn: 'maryann', normNn: 'oconnorsmith', givenFirst: 'maryann.oconnorsmith', surnameFirst: 'oconnorsmith.maryann' },
  { vn: '李', nn: '四', normVn: '', normNn: '', givenFirst: '', surnameFirst: '' },
  { vn: '', nn: 'Nachname', normVn: '', normNn: 'nachname', givenFirst: '', surnameFirst: '' },
];

describe('normalizeComponent — RESEARCH-UPN §11 Tabelle (14 Zeilen, alle vier Spalten)', () => {
  for (const row of TABLE_11) {
    it(`norm(${JSON.stringify(row.vn)}) === ${JSON.stringify(row.normVn)}`, () => {
      expect(normalizeComponent(row.vn)).toBe(row.normVn);
    });
    it(`norm(${JSON.stringify(row.nn)}) === ${JSON.stringify(row.normNn)}`, () => {
      expect(normalizeComponent(row.nn)).toBe(row.normNn);
    });
  }
});

describe('buildUsername — RESEARCH-UPN §11 Tabelle, givenFirst und surnameFirst', () => {
  for (const row of TABLE_11) {
    it(`buildUsername(${JSON.stringify(row.vn)}, ${JSON.stringify(row.nn)}, 'givenFirst') === ${JSON.stringify(row.givenFirst)}`, () => {
      expect(buildUsername(row.vn, row.nn, 'givenFirst')).toBe(row.givenFirst);
    });
    it(`buildUsername(${JSON.stringify(row.vn)}, ${JSON.stringify(row.nn)}, 'surnameFirst') === ${JSON.stringify(row.surnameFirst)}`, () => {
      expect(buildUsername(row.vn, row.nn, 'surnameFirst')).toBe(row.surnameFirst);
    });
  }
});

describe('normalizeComponent — Idempotenz über alle 14 Tabelleneingaben', () => {
  for (const row of TABLE_11) {
    it(`normalizeComponent(normalizeComponent(${JSON.stringify(row.vn)})) === normalizeComponent(${JSON.stringify(row.vn)})`, () => {
      const once = normalizeComponent(row.vn);
      expect(normalizeComponent(once)).toBe(once);
    });
    it(`normalizeComponent(normalizeComponent(${JSON.stringify(row.nn)})) === normalizeComponent(${JSON.stringify(row.nn)})`, () => {
      const once = normalizeComponent(row.nn);
      expect(normalizeComponent(once)).toBe(once);
    });
  }
});

describe('Reihenfolge-Beweis: Umlaut-Tabellen laufen vor NFD (RESEARCH-UPN §1 Schritt 3 vor 6)', () => {
  it("'Müller' (vorkomponiert) -> 'mueller', nicht 'muller'", () => {
    expect(normalizeComponent('Müller')).toBe('mueller');
  });

  it("'Weiß' -> 'weiss'", () => {
    expect(normalizeComponent('Weiß')).toBe('weiss');
  });
});

describe('RESEARCH-UPN §10 — die 5 Fixtures aus dem Referenzprojekt, ohne @domain', () => {
  it("normalizeOrder('nope') === 'givenFirst'", () => {
    expect(normalizeOrder('nope')).toBe('givenFirst');
  });

  it("buildUsername('max','mustermann','givenFirst') === 'max.mustermann'", () => {
    expect(buildUsername('max', 'mustermann', 'givenFirst')).toBe('max.mustermann');
  });

  it("buildUsername('max','mustermann','surnameFirst') === 'mustermann.max'", () => {
    expect(buildUsername('max', 'mustermann', 'surnameFirst')).toBe('mustermann.max');
  });

  it("buildUsername('Max','Müller','givenFirst') === 'max.mueller' (kein @domain)", () => {
    expect(buildUsername('Max', 'Müller', 'givenFirst')).toBe('max.mueller');
  });

  it("buildUsername('Max','Müller','surnameFirst') === 'mueller.max' (kein @domain)", () => {
    expect(buildUsername('Max', 'Müller', 'surnameFirst')).toBe('mueller.max');
  });
});

describe('normalizeComponent — Randfälle aus S02-Spec Abschnitt 1', () => {
  it('0 (Zahl) -> \'\' (Falsy-Guard)', () => {
    expect(normalizeComponent(0)).toBe('');
  });

  it("'0' (String) -> '0' (Ziffern bleiben)", () => {
    expect(normalizeComponent('0')).toBe('0');
  });

  it("123 (Zahl) -> '123' (Coercion, nicht falsy)", () => {
    expect(normalizeComponent(123)).toBe('123');
  });

  it("null -> ''", () => {
    expect(normalizeComponent(null)).toBe('');
  });

  it("undefined -> ''", () => {
    expect(normalizeComponent(undefined)).toBe('');
  });

  it("false -> ''", () => {
    expect(normalizeComponent(false)).toBe('');
  });

  it("'' -> ''", () => {
    expect(normalizeComponent('')).toBe('');
  });

  it("NFD-zerlegtes 'Müller' -> 'muller' (1:1-treu, kein Bug, macOS-CSVs liefern NFD)", () => {
    const nfdInput = 'Müller'.normalize('NFD');
    // sanity: the NFD form must actually differ byte-wise from the precomposed form
    expect(nfdInput).not.toBe('Müller');
    expect(normalizeComponent(nfdInput)).toBe('muller');
  });

  it("'St. Clair' -> 'st.clair' (Punkt bleibt, Leerzeichen fällt weg)", () => {
    expect(normalizeComponent('St. Clair')).toBe('st.clair');
  });

  it("buildUsername('Max.','Müller','givenFirst') -> 'max..mueller'", () => {
    expect(buildUsername('Max.', 'Müller', 'givenFirst')).toBe('max..mueller');
  });

  it("'李' -> '' (nicht-lateinisch fällt in Schritt 8 weg)", () => {
    expect(normalizeComponent('李')).toBe('');
  });

  it('keine Längenbegrenzung: eine ~500-Zeichen-Eingabe kommt in voller (übersetzter) Länge zurück', () => {
    const input = 'ü'.repeat(250); // 250 chars in, each becomes 'ue' (2 chars) -> 500 chars out
    const result = normalizeComponent(input);
    expect(result).toBe('ue'.repeat(250));
    expect(result.length).toBe(500);
  });
});

describe('truncateToFit', () => {
  it('Budget > second.length -> keine Kürzung, passt true, kein gekuerzt', () => {
    const result = truncateToFit({ first: 'ann', second: 'kurz', suffix: '', max: 20 });
    expect(result).toEqual({ second: 'kurz', gekuerzt: false, passt: true });
  });

  it('Budget > second.length mit Suffix -> keine Kürzung', () => {
    const result = truncateToFit({ first: 'ann', second: 'kurz', suffix: '.02022011', max: 64 });
    expect(result).toEqual({ second: 'kurz', gekuerzt: false, passt: true });
  });

  it('Budget === second.length (Grenzwert, exakte Passung) -> keine Kürzung, gekuerzt bleibt false', () => {
    // first='ann' (3), max=20, kein Suffix -> budget = 20-3-1-0 = 16 === second.length
    const second = 'b'.repeat(16);
    const result = truncateToFit({ first: 'ann', second, suffix: '', max: 20 });
    expect(result).toEqual({ second, gekuerzt: false, passt: true });
  });

  it('Budget === second.length mit Suffix (Grenzwert) -> keine Kürzung, gekuerzt bleibt false', () => {
    // first='ann' (3), suffix='.02022011' (9), max=20 -> budget = 20-3-1-9 = 7 === second.length
    const second = 'b'.repeat(7);
    const result = truncateToFit({ first: 'ann', second, suffix: '.02022011', max: 20 });
    expect(result).toEqual({ second, gekuerzt: false, passt: true });
  });

  it('Budget >= 1 und < second.length -> Kürzung von rechts, mindestens 1 Zeichen bleibt (ARCHITECTURE §6.1 Fall 1 Zeile 1)', () => {
    // first='ann' (3), max=20, kein Suffix -> budget = 20-3-1-0 = 16; second ist 17 Zeichen lang, muss also tatsächlich gekürzt werden
    const second = normalizeComponent('Bergmannschneider');
    expect(second.length).toBe(17);
    const result = truncateToFit({ first: 'ann', second, suffix: '', max: 20 });
    expect(result).toEqual({ second: 'bergmannschneide', gekuerzt: true, passt: true });
  });

  it('Budget === 1 (Grenzwert) -> second wird auf genau 1 Zeichen gekürzt, nicht auf 0', () => {
    // first.length=18, max=20, kein Suffix -> budget = 20-18-1-0 = 1
    const first = 'a'.repeat(18);
    const result = truncateToFit({ first, second: 'mueller', suffix: '', max: 20 });
    expect(result).toEqual({ second: 'm', gekuerzt: true, passt: true });
  });

  it('Budget >= 1 und < second.length mit Suffix -> Kürzung, alle drei Schlüssel gesetzt', () => {
    // first='ann' (3), suffix='.02022011' (9), max=20 -> budget = 20-3-1-9 = 7
    const result = truncateToFit({ first: 'ann', second: 'bergmannschneiderhuber', suffix: '.02022011', max: 20 });
    expect(result).toEqual({ second: 'bergman', gekuerzt: true, passt: true });
  });

  it('Budget < 1 -> passt false, second unverändert, alle drei Schlüssel gesetzt', () => {
    const first = 'a'.repeat(19); // first.length=19, max=20 -> budget = 20-19-1-0 = 0
    const result = truncateToFit({ first, second: 'mueller', suffix: '', max: 20 });
    expect(result).toEqual({ second: 'mueller', gekuerzt: false, passt: false });
  });

  it('Budget < 1 mit Suffix -> ebenfalls passt false', () => {
    const first = 'a'.repeat(10); // budget = 20-10-1-9 = 0
    const result = truncateToFit({ first, second: 'mueller', suffix: '.02022011', max: 20 });
    expect(result.passt).toBe(false);
    expect(result.gekuerzt).toBe(false);
    expect(result.second).toBe('mueller');
  });

  it('alle drei Schlüssel second/gekuerzt/passt sind auf jedem der drei Pfade vorhanden', () => {
    const paths = [
      // Pfad 1: budget >= second.length -> keine Kürzung
      { result: truncateToFit({ first: 'a', second: 'b', suffix: '', max: 20 }), gekuerzt: false, passt: true },
      // Pfad 2: budget >= 1 und < second.length -> Kürzung
      { result: truncateToFit({ first: 'a', second: 'b'.repeat(30), suffix: '', max: 10 }), gekuerzt: true, passt: true },
      // Pfad 3: budget < 1 -> passt false
      { result: truncateToFit({ first: 'a'.repeat(19), second: 'b', suffix: '', max: 20 }), gekuerzt: false, passt: false },
    ];
    for (const { result, gekuerzt, passt } of paths) {
      expect(result).toHaveProperty('second');
      expect(result).toHaveProperty('gekuerzt', gekuerzt);
      expect(result).toHaveProperty('passt', passt);
    }
  });

  it.each([
    { first: 'ann', suffix: '', max: 20 },
    { first: '', suffix: '', max: 1 },
    { first: 'x'.repeat(5), suffix: '.02022011', max: 20 },
  ])('leeres second hat Länge 0 und passt, solange das Budget nicht negativ wird (kein Sonderfall): %j', (params) => {
    const result = truncateToFit({ ...params, second: '' });
    expect(result).toEqual({ second: '', gekuerzt: false, passt: true });
  });

  it('Default max ist MAX_USERID (64), nicht irgendein anderer Wert >= 11', () => {
    // second ist mit 70 Zeichen lang genug, dass nur der echte Default (64) ein bestimmtes Budget erzwingt
    const second = 'b'.repeat(70);
    const result = truncateToFit({ first: 'max', second, suffix: '' });
    expect(result.gekuerzt).toBe(true);
    expect(result.second.length).toBe(60); // 64 - 3 (first) - 1 (Trennpunkt)
    expect(result.second).toBe(second.slice(0, 60));
  });

  it('truncateToFit ohne suffix verhält sich wie suffix: "" (dokumentierter Default)', () => {
    const withEmptySuffix = truncateToFit({ first: 'ann', second: 'bergmannschneiderhuber', suffix: '', max: 20 });
    const withoutSuffix = truncateToFit({ first: 'ann', second: 'bergmannschneiderhuber', max: 20 });
    expect(withoutSuffix).toEqual(withEmptySuffix);
  });

  it('truncateToFit ohne first verhält sich wie first: "" (dokumentierter Default)', () => {
    // max=8, kein first, kein suffix -> budget = 8-0-1-0 = 7 === second.length (Grenzwert, exakte Passung):
    // jeder nicht-leere Default für first verschiebt das Budget unter 7 und erzwingt gekuerzt:true.
    const withEmptyFirst = truncateToFit({ first: '', second: 'mueller', suffix: '', max: 8 });
    const withoutFirst = truncateToFit({ second: 'mueller', max: 8 });
    expect(withoutFirst).toEqual(withEmptyFirst);
    expect(withoutFirst).toEqual({ second: 'mueller', gekuerzt: false, passt: true });
  });

  it('truncateToFit ohne second verhält sich wie second: "" (dokumentierter Default)', () => {
    const withEmptySecond = truncateToFit({ first: 'ann', second: '', suffix: '', max: 20 });
    const withoutSecond = truncateToFit({ first: 'ann', max: 20 });
    expect(withoutSecond).toEqual(withEmptySecond);
    expect(withoutSecond).toEqual({ second: '', gekuerzt: false, passt: true });
  });

  it('truncateToFit() ohne jedes Argument wirft nicht (Argumentobjekt selbst defaultet auf {})', () => {
    expect(() => truncateToFit()).not.toThrow();
    expect(truncateToFit()).toEqual({ second: '', gekuerzt: false, passt: true });
  });

  it('truncateToFit(null) wirft nicht (Argumentobjekt defaultet auf {})', () => {
    expect(() => truncateToFit(null)).not.toThrow();
    expect(truncateToFit(null)).toEqual({ second: '', gekuerzt: false, passt: true });
  });

  it('Kürzung entfernt Zeichen von rechts, der Präfix bleibt erhalten', () => {
    const result = truncateToFit({ first: '', second: 'abcdefgh', suffix: '', max: 4 });
    // budget = 4-0-1-0 = 3
    expect(result.second).toBe('abc');
  });

  it('Reihenfolgeunabhängigkeit (ARCHITECTURE §6.1 Fall 2, Zeile 2): truncateToFit kennt kein order-Argument, derselbe second-Schnitt passt bugfrei in beide Kompositionen', () => {
    const params = { first: 'ann', second: 'bergmannschneiderhuber', suffix: '.02022011', max: 20 };
    const result = truncateToFit(params);
    expect(result.second).toBe('bergman');
    expect(result.gekuerzt).toBe(true);
    const composedGivenFirst = `${params.first}.${result.second}${params.suffix}`;
    const composedSurnameFirst = `${result.second}.${params.first}${params.suffix}`;
    expect(composedGivenFirst).toBe('ann.bergman.02022011');
    expect(composedSurnameFirst).toBe('bergman.ann.02022011');
    expect(composedGivenFirst.length).toBe(20);
    expect(composedSurnameFirst.length).toBe(20);
  });

  it('Invariante bei passt:true: first.length + 1 + second.length + suffix.length <= max; gekuerzt:true impliziert total === max, die Umkehrung gilt nicht (Grenzwert budget === second.length: total === max UND gekuerzt:false)', () => {
    // gekuerzt:true -> total === max always holds. The converse is false: at the exact-fit
    // boundary (budget === second.length) total === max too, but gekuerzt stays false because
    // nothing was actually cut. The non-truncating branch is therefore pinned with <=, not <.
    const cases = [
      { first: 'ann', second: 'kurz', suffix: '', max: 20, gekuerzt: false },
      { first: 'ann', second: 'bergmannschneiderhuber', suffix: '.02022011', max: 20, gekuerzt: true },
      { first: '', second: 'abcdefgh', suffix: '', max: 4, gekuerzt: true },
      { first: 'max', second: 'mustermann', suffix: '.02022011', max: 64, gekuerzt: false },
      // exact-fit boundary: budget (16) === second.length (16) -> total === max, gekuerzt: false
      { first: 'ann', second: 'b'.repeat(16), suffix: '', max: 20, gekuerzt: false, boundary: true },
    ];
    for (const { gekuerzt, boundary, ...params } of cases) {
      const result = truncateToFit(params);
      expect(result.passt).toBe(true);
      expect(result.gekuerzt).toBe(gekuerzt);
      const total = params.first.length + 1 + result.second.length + params.suffix.length;
      if (gekuerzt) {
        expect(total).toBe(params.max);
      } else {
        expect(total).toBeLessThanOrEqual(params.max);
        if (boundary) expect(total).toBe(params.max);
      }
    }
  });

  it('passt:false -> second bleibt unverändert und die Summe überschreitet max (kein Widerspruch zur Invariante, die nur für passt:true gilt)', () => {
    const params = { first: 'a'.repeat(19), second: 'mueller', suffix: '', max: 20 };
    const result = truncateToFit(params);
    expect(result.passt).toBe(false);
    expect(result.second).toBe(params.second);
    const total = params.first.length + 1 + result.second.length + params.suffix.length;
    expect(total).toBeGreaterThan(params.max);
  });
});

describe('validateUserid — erwartete messageId je Fall (S02-Spec Abschnitt 7)', () => {
  const cases = [
    { s: '', quelle: 'generator', expected: { ok: false, messageId: 'username_leer' } },
    { s: '', quelle: 'manuell', expected: { ok: false, messageId: 'username_leer' } },
    { s: null, quelle: 'generator', expected: { ok: false, messageId: 'username_leer' } },
    { s: null, quelle: 'manuell', expected: { ok: false, messageId: 'username_leer' } },
    { s: 42, quelle: 'generator', expected: { ok: false, messageId: 'username_leer' } },
    { s: 42, quelle: 'manuell', expected: { ok: false, messageId: 'username_leer' } },
    { s: {}, quelle: 'generator', expected: { ok: false, messageId: 'username_leer' } },
    { s: {}, quelle: 'manuell', expected: { ok: false, messageId: 'username_leer' } },
    { s: '...', quelle: 'generator', expected: { ok: false, messageId: 'username_nur_punkte' } },
    { s: '...', quelle: 'manuell', expected: { ok: false, messageId: 'username_nur_punkte' } },
    // MAX_USERID + 1 Punkte: nur-Punkte UND zu-lang träfen beide zu -> beweist, dass Prüfung 2 vor Prüfung 3 läuft
    { s: '.'.repeat(MAX_USERID + 1), quelle: 'generator', expected: { ok: false, messageId: 'username_nur_punkte' } },
    { s: '.'.repeat(MAX_USERID + 1), quelle: 'manuell', expected: { ok: false, messageId: 'username_nur_punkte' } },
    { s: 'a'.repeat(64), quelle: 'generator', expected: { ok: true } },
    { s: 'a'.repeat(64), quelle: 'manuell', expected: { ok: true } },
    { s: 'a'.repeat(65), quelle: 'generator', expected: { ok: false, messageId: 'username_zu_lang' } },
    { s: 'a'.repeat(65), quelle: 'manuell', expected: { ok: false, messageId: 'username_zu_lang' } },
    { s: '.htaccess', quelle: 'generator', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: '.htaccess', quelle: 'manuell', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: '.HTACCESS', quelle: 'generator', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: '.HTACCESS', quelle: 'manuell', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: 'appdata_abc', quelle: 'generator', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: 'appdata_abc', quelle: 'manuell', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: 'APPDATA_x', quelle: 'generator', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: 'APPDATA_x', quelle: 'manuell', expected: { ok: false, messageId: 'username_reserviert' } },
    { s: 'müller!', quelle: 'generator', expected: { ok: false, messageId: 'username_zeichen' } },
    { s: 'müller!', quelle: 'manuell', expected: { ok: false, messageId: 'username_zeichen' } },
    { s: 'max_mueller', quelle: 'manuell', expected: { ok: true } },
    { s: 'max_mueller', quelle: 'generator', expected: { ok: false, messageId: 'username_zeichen' } },
    { s: 'Max', quelle: 'manuell', expected: { ok: true } },
    { s: 'Max', quelle: 'generator', expected: { ok: false, messageId: 'username_zeichen' } },
    { s: 'max.mueller', quelle: undefined, expected: { ok: true } },
    { s: 'Max', quelle: undefined, expected: { ok: false, messageId: 'username_zeichen' } },
    // unbekannte (nicht nur fehlende) quelle fällt ebenfalls auf den strengeren generator-Zeichensatz zurück
    { s: 'Max', quelle: 'nope', expected: { ok: false, messageId: 'username_zeichen' } },
    // quelle-Vergleich ist case-sensitiv: 'MANUELL' ist nicht 'manuell' und fällt auf generator zurück
    { s: 'Max', quelle: 'MANUELL', expected: { ok: false, messageId: 'username_zeichen' } },
  ];

  for (const { s, quelle, expected } of cases) {
    it(`validateUserid(${JSON.stringify(s)}, { quelle: ${JSON.stringify(quelle)} }) -> ${JSON.stringify(expected)}`, () => {
      expect(validateUserid(s, { quelle })).toEqual(expected);
    });
  }

  it('transformiert nie: ok:false liefert nur { ok, messageId }, kein dritter Schlüssel', () => {
    const result = validateUserid('müller!', { quelle: 'generator' });
    expect(Object.keys(result).sort()).toEqual(['messageId', 'ok']);
  });

  it("validateUserid('Max') mit komplett fehlendem Options-Argument -> username_zeichen (fail closed auf generator-Zeichensatz)", () => {
    expect(validateUserid('Max')).toEqual({ ok: false, messageId: 'username_zeichen' });
  });

  it("validateUserid('Max', null) wirft nicht und fällt auf den generator-Zeichensatz zurück", () => {
    expect(() => validateUserid('Max', null)).not.toThrow();
    expect(validateUserid('Max', null)).toEqual({ ok: false, messageId: 'username_zeichen' });
  });

  it("validateUserid('Max', 'manuell') wirft nicht; ein String als zweites Argument hat keine .quelle-Property und fällt auf den generator-Zeichensatz zurück", () => {
    expect(() => validateUserid('Max', 'manuell')).not.toThrow();
    expect(validateUserid('Max', 'manuell')).toEqual({ ok: false, messageId: 'username_zeichen' });
  });

  it("validateUserid('Max', 42) wirft nicht; eine Number als zweites Argument hat keine .quelle-Property und fällt auf den generator-Zeichensatz zurück", () => {
    expect(() => validateUserid('Max', 42)).not.toThrow();
    expect(validateUserid('Max', 42)).toEqual({ ok: false, messageId: 'username_zeichen' });
  });
});

describe('RESERVED_USERIDS', () => {
  it('ist eingefroren (frozen)', () => {
    expect(Object.isFrozen(RESERVED_USERIDS)).toBe(true);
  });

  it('enthält alle acht benannten reservierten Namen aus RESEARCH-OCS §7', () => {
    const required = [
      '.htaccess',
      'files_external',
      '__groupfolders',
      '.ncdata',
      'owncloud.log',
      'nextcloud.log',
      'updater.log',
      'audit.log',
    ];
    for (const name of required) {
      expect(RESERVED_USERIDS).toContain(name);
    }
  });
});

describe('RESERVED_USERIDS — jeder einzelne Eintrag wird von validateUserid tatsächlich abgelehnt', () => {
  for (const name of RESERVED_USERIDS) {
    for (const quelle of ['generator', 'manuell']) {
      it(`validateUserid(${JSON.stringify(name)}, { quelle: '${quelle}' }) -> username_reserviert`, () => {
        expect(validateUserid(name, { quelle })).toEqual({ ok: false, messageId: 'username_reserviert' });
      });
    }
  }

  it("validateUserid('FILES_EXTERNAL', { quelle: 'generator' }) -> username_reserviert (Case-Variante)", () => {
    expect(validateUserid('FILES_EXTERNAL', { quelle: 'generator' })).toEqual({ ok: false, messageId: 'username_reserviert' });
  });

  it("validateUserid('FILES_EXTERNAL', { quelle: 'manuell' }) -> username_reserviert (Case-Variante)", () => {
    expect(validateUserid('FILES_EXTERNAL', { quelle: 'manuell' })).toEqual({ ok: false, messageId: 'username_reserviert' });
  });
});

describe('Kein I/O — username.js ruft nie fetch auf (verhaltensbasiert, kein Quelltext-Regex)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('jeder Funktions-Export kann aufgerufen werden, ohne dass der gestubbte fetch-Spy jemals feuert', () => {
    const throwingFetch = vi.fn(() => {
      throw new Error('username.js must never perform network I/O');
    });
    vi.stubGlobal('fetch', throwingFetch);

    const functionExports = Object.entries(username).filter(([, value]) => typeof value === 'function');
    expect(functionExports.length).toBeGreaterThan(0);

    for (const [name, fn] of functionExports) {
      switch (name) {
        case 'normalizeOrder':
          fn('givenFirst');
          break;
        case 'normalizeComponent':
          fn('Müller');
          break;
        case 'buildUsername':
          fn('Max', 'Müller', 'givenFirst');
          break;
        case 'truncateToFit':
          fn({ first: 'ann', second: 'mueller', suffix: '', max: 20 });
          break;
        case 'validateUserid':
          fn('max.mueller', { quelle: 'generator' });
          break;
        default:
          // All current function exports have an explicit case above; a new export reaching
          // this arm must fail loudly instead of being called blindly and masking the real assertion.
          throw new Error(`no-I/O test: unhandled function export '${name}' — add an explicit call case`);
      }
    }

    expect(throwingFetch).not.toHaveBeenCalled();
  });
});
