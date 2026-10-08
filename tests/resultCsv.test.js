// S08 A3: exact header, column order, separator, CRLF, BOM, null handling, quoting.
import { describe, expect, it } from 'vitest';
import { buildResultCsv, buildResultCsvReport } from '../src/shared/resultCsv.js';
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
