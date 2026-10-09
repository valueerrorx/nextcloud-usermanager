// S08 A3: exact header, column order, separator, CRLF, BOM, null handling, quoting.
import { describe, expect, it } from 'vitest';
import { buildResultCsv, buildResultCsvReport, buildImportResultCsv, buildImportResultCsvReport } from '../src/shared/resultCsv.js';
import { MESSAGES } from '../src/shared/messages.js';

describe('buildResultCsv', () => {
  it('beginnt mit der UTF-8-BOM gefolgt von der exakten Kopfzeile', () => {
    const csv = buildResultCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('userid;aktion;status;grund;httpStatus;ocsCode\r\n');
  });

  it('eine Zeile: sechs Spalten in der exakten Reihenfolge, Trennzeichen ";", Zeilenende "\\r\\n"', () => {
    const csv = buildResultCsv([{ userid: 'alice', aktion: 'user.enable', status: 'ok', grund: 'Erfolgreich.', httpStatus: 200, ocsCode: 100 }]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('userid;aktion;status;grund;httpStatus;ocsCode');
    expect(lines[1]).toBe('alice;user.enable;ok;Erfolgreich.;200;100');
    expect(lines[2]).toBe(''); // trailing CRLF after the last line
  });

  it('null wird zu einem leeren Feld, nicht zum Text "null"', () => {
    const csv = buildResultCsv([{ userid: 'bob', aktion: 'user.disable', status: 'nicht ausgeführt', grund: null, httpStatus: null, ocsCode: null }]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('bob;user.disable;nicht ausgeführt;;;');
    expect(line).not.toContain('null');
  });

  // Pflichttest: ein ';' innerhalb von grund muss das Feld in Anführungszeichen setzen.
  it('ein ";" im grund-Feld wird in Anführungszeichen gesetzt', () => {
    const csv = buildResultCsv([{ userid: 'carol', aktion: 'user.delete', status: 'fehler', grund: 'Fehler; Ursache unbekannt', httpStatus: 500, ocsCode: 101 }]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('carol;user.delete;fehler;"Fehler; Ursache unbekannt";500;101');
  });

  it('ein \'"\' im grund-Feld wird verdoppelt und das Feld in Anführungszeichen gesetzt', () => {
    const csv = buildResultCsv([{ userid: 'dave', aktion: 'user.update', status: 'teilweise', grund: 'Feld "email" ungültig', httpStatus: 400, ocsCode: 102 }]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('dave;user.update;teilweise;"Feld ""email"" ungültig";400;102');
  });

  // Review-Gap: die Quoting-Regex deckt \n und \r, aber nur \n war je mit einem echten Test belegt.
  it('ein CRLF innerhalb von grund wird ebenfalls in Anführungszeichen gesetzt', () => {
    const csv = buildResultCsv([{ userid: 'erin', aktion: 'user.update', status: 'fehler', grund: 'Zeile eins\r\nZeile zwei', httpStatus: 400, ocsCode: 102 }]);
    expect(csv).toContain('erin;user.update;fehler;"Zeile eins\r\nZeile zwei";400;102');
  });

  it('mehrere Zeilen sind jeweils mit \\r\\n getrennt und erscheinen in Eingabereihenfolge', () => {
    const csv = buildResultCsv([
      { userid: 'alice', aktion: 'user.enable', status: 'ok', grund: 'Erfolgreich.', httpStatus: 200, ocsCode: 100 },
      { userid: 'bob', aktion: 'user.enable', status: 'fehler', grund: 'Abgelehnt.', httpStatus: 403, ocsCode: 997 },
    ]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toEqual([
      'userid;aktion;status;grund;httpStatus;ocsCode',
      'alice;user.enable;ok;Erfolgreich.;200;100',
      'bob;user.enable;fehler;Abgelehnt.;403;997',
      '',
    ]);
  });
});

// S11 A3 / Abnahme 6: der Import-Export hat eine siebte Spalte "passwort", Spalten 1-6 bleiben
// identisch zum Batch-Bericht (DECISIONS "Ergebnis-CSV: Spalten des Import-Exports").
describe('buildImportResultCsv', () => {
  it('beginnt mit der UTF-8-BOM, Kopfzeile hat sieben Spalten in der dokumentierten Reihenfolge', () => {
    const csv = buildImportResultCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('userid;aktion;status;grund;httpStatus;ocsCode;passwort\r\n');
  });

  it('Spalten 1-6 sind byte-identisch zum Batch-Bericht für dieselben Zeilen, inkl. ";" im grund einer teilweise-Zeile', () => {
    const rows = [
      { userid: 'alice', aktion: 'user.create', status: 'ok', grund: null, httpStatus: 200, ocsCode: null, passwort: 'Geheim123!' },
      {
        userid: 'bob',
        aktion: 'user.create',
        status: 'teilweise',
        grund: 'Gruppe x; Gruppe y konnte nicht zugewiesen werden',
        httpStatus: 200,
        ocsCode: 102,
        passwort: 'Bob456!',
      },
    ];
    const batchLines = buildResultCsv(rows).slice(1).split('\r\n');
    const importLines = buildImportResultCsv(rows).slice(1).split('\r\n');

    expect(importLines[0]).toBe(`${batchLines[0]};passwort`);
    expect(importLines[1]).toBe(`${batchLines[1]};Geheim123!`);
    expect(importLines[2]).toBe(`${batchLines[2]};Bob456!`);
  });

  it('Spalte 7 (passwort) enthält das Initialpasswort bei Status ok', () => {
    const csv = buildImportResultCsv([
      { userid: 'alice', aktion: 'user.create', status: 'ok', grund: null, httpStatus: 200, ocsCode: null, passwort: 'Geheim123!' },
    ]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('alice;user.create;ok;;200;;Geheim123!');
  });

  it('Zeile ohne Username (Vorschaufehler vor der Benutzername-Erzeugung) -> Spalte 1 ist "Zeile n"', () => {
    const csv = buildImportResultCsv([
      { userid: 'Zeile 3', aktion: 'user.create', status: 'fehler', grund: 'name_nicht_abbildbar', httpStatus: null, ocsCode: null, passwort: null },
    ]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line.split(';')[0]).toBe('Zeile 3');
  });

  it('ein ";" im grund-Feld wird in Anführungszeichen gesetzt, das leere Passwort-Feld bleibt am Ende', () => {
    const csv = buildImportResultCsv([
      { userid: 'carol', aktion: 'user.create', status: 'fehler', grund: 'Fehler; Ursache unbekannt', httpStatus: 500, ocsCode: 101, passwort: null },
    ]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('carol;user.create;fehler;"Fehler; Ursache unbekannt";500;101;');
  });

  it('mehrere Zeilen sind mit \\r\\n getrennt, in Eingabereihenfolge, mit abschließendem CRLF', () => {
    const csv = buildImportResultCsv([
      { userid: 'alice', aktion: 'user.create', status: 'ok', grund: null, httpStatus: 200, ocsCode: null, passwort: 'pw1' },
      { userid: 'bob', aktion: 'user.create', status: 'fehler', grund: 'userid_nicht_erzeugbar', httpStatus: 200, ocsCode: 111, passwort: null },
    ]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toEqual([
      'userid;aktion;status;grund;httpStatus;ocsCode;passwort',
      'alice;user.create;ok;;200;;pw1',
      'bob;user.create;fehler;userid_nicht_erzeugbar;200;111;',
      '',
    ]);
  });
});

describe('buildImportResultCsvReport - löst messageId-grund vor dem Bauen der CSV auf', () => {
  it('eine ItemResult.grund-messageId wird zum deutschen Text, Spalte 7 (passwort) bleibt unverändert', () => {
    const csv = buildImportResultCsvReport([
      { userid: 'alice', aktion: 'user.create', status: 'fehler', grund: 'userid_nicht_erzeugbar', httpStatus: 200, ocsCode: 111, passwort: null },
    ]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe(`alice;user.create;fehler;${MESSAGES.userid_nicht_erzeugbar};200;111;`);
  });
});

// S06/S08 Review: die .map()-Auflösung von grund gehört nicht in JobProgress.vue (REVIEW-NOTES [S06]).
describe('buildResultCsvReport — löst messageId-grund vor dem Bauen der CSV auf', () => {
  it('eine ItemResult.grund-messageId wird zum deutschen Text, bevor die Zeile gebaut wird', () => {
    const csv = buildResultCsvReport([
      { userid: 'alice', aktion: 'user.delete', status: 'fehler', grund: 'server_blockt_vorerst', httpStatus: 429, ocsCode: null },
    ]);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe(`alice;user.delete;fehler;${MESSAGES.server_blockt_vorerst};429;`);
  });
});
