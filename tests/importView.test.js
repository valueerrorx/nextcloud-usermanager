// S10-Review [S06]: serverUserIds/anzahlAnzulegen/dateiName waren Ableitungen in ImportView.vue
// und damit untestbar - hier als pure Funktionen geprüft.
import { describe, expect, it } from 'vitest';
import { anzahlAnzulegen, dateiName, serverUserIds } from '../src/shared/importView.js';

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
