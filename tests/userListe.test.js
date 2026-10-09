import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseUserList } from '../src/shared/csvImport.js';
import { auswahlNachCsv, ordneUserliste, userlisteRueckmeldung } from '../src/shared/userListe.js';

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const src = (pfad) => readFileSync(fileURLToPath(new URL(pfad, import.meta.url)), 'utf8');

describe('parseUserList', () => {
  it('Fixture mit Header: Header und Leerzeile weg', () => {
    expect(parseUserList(fixture('userliste-mit-header.csv')).usernames)
      .toEqual(['max.mueller', 'anna.schmidt']);
  });

  it('Fixture ohne Header: alle Zeilen sind Usernamen', () => {
    expect(parseUserList(fixture('userliste-ohne-header.csv')).usernames)
      .toEqual(['max.mueller', 'anna.schmidt']);
  });

  it('Whitespace, CRLF, BOM und Leerzeilen', () => {
    expect(parseUserList('﻿username\r\n  anna  \r\n\r\n\tben\r\n').usernames).toEqual(['anna', 'ben']);
  });

  it('leere Eingabe -> keine Usernamen', () => {
    expect(parseUserList('').usernames).toEqual([]);
  });
});

describe('ordneUserliste', () => {
  it('Aaron.w und aaron.w sind getrennt: Vergleich ist exakt', () => {
    const r = ordneUserliste(['aaron.w', 'Aaron.w'], [{ userid: 'Aaron.w' }]);
    expect(r).toEqual({ gefunden: ['Aaron.w'], nichtGefunden: ['aaron.w'] });
  });

  it('Duplikate zählen einmal, unbekannte landen in nichtGefunden', () => {
    const r = ordneUserliste(['a', 'a', 'x'], [{ userid: 'a' }]);
    expect(r).toEqual({ gefunden: ['a'], nichtGefunden: ['x'] });
  });
});

describe('auswahlNachCsv', () => {
  it('normal: genau die gefundenen User', () => {
    expect(auswahlNachCsv({ gefunden: ['a', 'b'], nichtGefunden: ['x'] })).toEqual(['a', 'b']);
  });

  it('kein Treffer: leere Auswahl, die alte bleibt nicht erhalten', () => {
    expect(auswahlNachCsv({ gefunden: [], nichtGefunden: ['x'] })).toEqual([]);
  });
});

describe('userlisteRueckmeldung', () => {
  it('nennt gelesen/gefunden und die unbekannten Namen', () => {
    const text = userlisteRueckmeldung({ gefunden: ['a'], nichtGefunden: ['x', 'y'] });
    expect(text).toContain('3 Benutzernamen gelesen, davon 1 in der Liste gefunden');
    expect(text).toContain('Nicht gefunden: x, y.');
  });

  it('kürzt lange Listen der Nicht-Gefundenen', () => {
    const viele = Array.from({ length: 12 }, (_, i) => `u${i}`);
    expect(userlisteRueckmeldung({ gefunden: [], nichtGefunden: viele })).toContain('und 2 weitere');
  });

  it('leere Datei -> eigener Hinweis', () => {
    expect(userlisteRueckmeldung({ gefunden: [], nichtGefunden: [] })).toContain('keine Benutzernamen');
  });
});

describe('Verdrahtung S15', () => {
  const view = src('../src/renderer/views/UsersView.vue');
  it('UsersView ruft files.openCsv mit zweck userliste und parseUserList auf', () => {
    expect(view).toMatch(/filesOpenCsv\(\{ zweck: 'userliste' \}\)/);
    expect(view).toContain('parseUserList(');
  });
});
