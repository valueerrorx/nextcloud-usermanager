// S10-Review [S06]: serverUserIds/anzahlAnzulegen/dateiName waren Ableitungen in ImportView.vue
// und damit untestbar - hier als pure Funktionen geprüft.
import { describe, expect, it } from 'vitest';
import { anzahlAnzulegen, dateiName, serverUserIds, buildCreateUserItems, buildImportExportRows } from '../src/shared/importView.js';

describe('serverUserIds', () => {
  it('extrahiert userid aus jedem UserView, Reihenfolge bleibt erhalten', () => {
    const users = [{ userid: 'alice' }, { userid: 'Bob' }];
    expect(serverUserIds(users)).toEqual(['alice', 'Bob']);
  });

  it('leere Userliste -> leeres Array', () => {
    expect(serverUserIds([])).toEqual([]);
  });
});

describe('anzahlAnzulegen', () => {
  it('summiert neu und kollisionAufgeloest, fehler zählt nicht mit', () => {
    expect(anzahlAnzulegen({ neu: 3, kollisionAufgeloest: 2, fehler: 5 })).toBe(5);
  });

  it('ohne Summary (noch keine Vorschau möglich) -> 0', () => {
    expect(anzahlAnzulegen(null)).toBe(0);
  });
});

describe('dateiName', () => {
  it('extrahiert den Dateinamen aus einem Unix-Pfad', () => {
    expect(dateiName('/home/admin/import.csv')).toBe('import.csv');
  });

  it('extrahiert den Dateinamen aus einem Windows-Pfad', () => {
    expect(dateiName('C:\\Users\\admin\\import.csv')).toBe('import.csv');
  });
});

// S11 B1: welche Vorschauzeilen überhaupt einen actions.run-Request auslösen dürfen - nie Fehlerzeilen.
describe('buildCreateUserItems', () => {
  it('nur Zeilen mit Status neu oder kollision_aufgeloest werden zu Items, Fehlerzeilen nie', () => {
    const planRows = [
      { zeile: 1, username: 'alice', status: 'neu', passwort: 'pw-alice', displayname: 'Alice A.' },
      { zeile: 2, username: 'bob.2024', status: 'kollision_aufgeloest', passwort: 'pw-bob', displayname: 'Bob B.' },
      { zeile: 3, username: null, status: 'fehler', passwort: null, displayname: 'Carol C.', fehlerId: 'name_nicht_abbildbar' },
    ];
    const { items, byUserid } = buildCreateUserItems(planRows);
    expect(items).toEqual(['alice', 'bob.2024']);
    expect(Object.keys(byUserid)).toEqual(['alice', 'bob.2024']);
  });

  it('die Parameter pro userid tragen Passwort und Anzeigename aus der jeweiligen Vorschauzeile', () => {
    const planRows = [{ zeile: 1, username: 'alice', status: 'neu', passwort: 'Geheim123!', displayname: 'Alice Anders' }];
    const { byUserid } = buildCreateUserItems(planRows);
    expect(byUserid.alice).toEqual({ password: 'Geheim123!', displayName: 'Alice Anders' });
  });

  it('leere Vorschau -> leere Items und leeres byUserid', () => {
    expect(buildCreateUserItems([])).toEqual({ items: [], byUserid: {} });
  });
});

// S11 A3 Umfang: Pipeline-Ergebnisse PLUS die in der Vorschau abgewiesenen Fehlerzeilen, jede
// Eingabezeile genau einmal (DECISIONS "Import-Ergebnis-Export Umfang").
describe('buildImportExportRows', () => {
  it('jede Eingabezeile erscheint genau einmal: 2 erfolgreich, 1 teilweise, 1 Pipeline-Fehler, 2 Vorschau-Fehler', () => {
    const planRows = [
      { zeile: 1, username: 'alice', status: 'neu', passwort: 'pw-alice', displayname: 'Alice A.' },
      { zeile: 2, username: 'bob', status: 'neu', passwort: 'pw-bob', displayname: 'Bob B.' },
      { zeile: 3, username: 'carol', status: 'kollision_aufgeloest', passwort: 'pw-carol', displayname: 'Carol C.' },
      { zeile: 4, username: 'dave', status: 'neu', passwort: 'pw-dave', displayname: 'Dave D.' },
      { zeile: 5, username: null, status: 'fehler', fehlerId: 'name_nicht_abbildbar' },
      { zeile: 6, username: 'erin', status: 'fehler', fehlerId: 'username_zu_lang' },
    ];
    const results = [
      { userid: 'alice', aktion: 'user.create', status: 'ok', grund: null, httpStatus: 200, ocsCode: null },
      { userid: 'bob', aktion: 'user.create', status: 'ok', grund: null, httpStatus: 200, ocsCode: null },
      {
        userid: 'carol',
        aktion: 'user.create',
        status: 'teilweise',
        grund: 'Gruppe "x" konnte nicht zugewiesen werden',
        httpStatus: 200,
        ocsCode: 102,
      },
      { userid: 'dave', aktion: 'user.create', status: 'fehler', grund: 'benutzer_existiert_bereits', httpStatus: 200, ocsCode: 102 },
    ];

    const rows = buildImportExportRows(planRows, results);

    // Genau 6 Zeilen - keine Dublette, keine fehlende, für jede der 6 Eingabezeilen eine Ausgabezeile.
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.userid)).toEqual(['alice', 'bob', 'carol', 'dave', 'Zeile 5', 'erin']);
    expect(new Set(rows.map((r) => r.userid)).size).toBe(6);

    expect(rows[0]).toMatchObject({ userid: 'alice', status: 'ok', passwort: 'pw-alice' });
    expect(rows[1]).toMatchObject({ userid: 'bob', status: 'ok', passwort: 'pw-bob' });
    expect(rows[2]).toMatchObject({
      userid: 'carol',
      status: 'teilweise',
      grund: 'Gruppe "x" konnte nicht zugewiesen werden',
      passwort: 'pw-carol',
    });
    expect(rows[3]).toMatchObject({ userid: 'dave', status: 'fehler', grund: 'benutzer_existiert_bereits', passwort: null });
    expect(rows[4]).toMatchObject({ userid: 'Zeile 5', status: 'fehler', grund: 'name_nicht_abbildbar', passwort: null });
    expect(rows[5]).toMatchObject({ userid: 'erin', status: 'fehler', grund: 'username_zu_lang', passwort: null });
  });
});
