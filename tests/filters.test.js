// S06: quotaStufe-Grenzwerte, matchesSuche, Sortierung (Umlaute, Quota-Ende), Filter (UND,
// Immutabilität), pruneAuswahl.
import { describe, expect, it } from 'vitest';
import {
  alleAusgewaehlt, filterUsers, gruppenDerUser, gruppenOptionen, matchesSuche, pruneAuswahl, quotaStufe,
  SEITEN_GROESSEN, seitenAusschnitt, sortUsers,
} from '../src/shared/filters.js';

function quota(kind, usagePercent = null) {
  return { kind, limitBytes: null, usedBytes: null, usagePercent, roh: null };
}

function user(overrides = {}) {
  return {
    userid: 'bob', displayname: 'Bob', email: 'bob@example.com', enabled: true, groups: [],
    quota: quota('unknown'), ...overrides,
  };
}

describe('quotaStufe — Grenzwerte', () => {
  it('genau 50 gehört zu f50bis90', () => {
    expect(quotaStufe(quota('limited', 50))).toBe('f50bis90');
  });

  it('genau 90 gehört zu f50bis90', () => {
    expect(quotaStufe(quota('limited', 90))).toBe('f50bis90');
  });

  it('90,1 gehört zu ueber90', () => {
    expect(quotaStufe(quota('limited', 90.1))).toBe('ueber90');
  });

  it('49,9 gehört zu unter50', () => {
    expect(quotaStufe(quota('limited', 49.9))).toBe('unter50');
  });

  it('unlimited -> unbegrenzt', () => {
    expect(quotaStufe(quota('unlimited'))).toBe('unbegrenzt');
  });

  it('unknown -> unbekannt', () => {
    expect(quotaStufe(quota('unknown'))).toBe('unbekannt');
  });

  it('limited mit usagePercent null (limitBytes === 0 Shape) -> unbekannt', () => {
    expect(quotaStufe({ kind: 'limited', limitBytes: 0, usedBytes: null, usagePercent: null, roh: null }))
      .toBe('unbekannt');
  });

  it('q == null liefert unbekannt statt zu werfen', () => {
    expect(() => quotaStufe(null)).not.toThrow();
    expect(quotaStufe(null)).toBe('unbekannt');
    expect(quotaStufe(undefined)).toBe('unbekannt');
  });

  it('Objekt ohne kind-Feld liefert unbekannt', () => {
    expect(quotaStufe({})).toBe('unbekannt');
  });
});

describe('matchesSuche', () => {
  it('Treffer im userid, case-insensitiv', () => {
    expect(matchesSuche(user({ userid: 'AnnaMuster' }), 'anna')).toBe(true);
  });

  it('Treffer im displayname', () => {
    expect(matchesSuche(user({ displayname: 'Anna Muster' }), 'MUSTER')).toBe(true);
  });

  it('Treffer in der email', () => {
    expect(matchesSuche(user({ email: 'anna@beispiel.de' }), 'beispiel')).toBe(true);
  });

  it('leerer oder getrimmt leerer Query -> true', () => {
    expect(matchesSuche(user(), '')).toBe(true);
    expect(matchesSuche(user(), '   ')).toBe(true);
  });

  it('email: null wirft nicht und liefert false für einen E-Mail-Treffer', () => {
    expect(() => matchesSuche(user({ email: null }), 'xyz')).not.toThrow();
    expect(matchesSuche(user({ email: null }), 'xyz')).toBe(false);
  });

  it('kein Treffer in keinem der drei Felder -> false', () => {
    expect(matchesSuche(user(), 'nirgends')).toBe(false);
  });
});

describe('sortUsers', () => {
  it('Umlaute: Ärzte sortiert vor Bauer (localeCompare de)', () => {
    const result = sortUsers(
      [user({ userid: 'bauer', displayname: 'Bauer' }), user({ userid: 'aerzte', displayname: 'Ärzte' })],
      { feld: 'displayname', richtung: 'aufsteigend' },
    );
    expect(result.map((u) => u.displayname)).toEqual(['Ärzte', 'Bauer']);
  });

  it('absteigend kehrt die Reihenfolge um', () => {
    const result = sortUsers(
      [user({ userid: 'a' }), user({ userid: 'c' }), user({ userid: 'b' })],
      { feld: 'userid', richtung: 'absteigend' },
    );
    expect(result.map((u) => u.userid)).toEqual(['c', 'b', 'a']);
  });

  it('Quota-Sortierung: unbegrenzt und unbekannt landen aufsteigend am Ende', () => {
    const users = [
      user({ userid: 'voll', quota: quota('limited', 95) }),
      user({ userid: 'unbegrenzt', quota: quota('unlimited') }),
      user({ userid: 'leer', quota: quota('limited', 10) }),
      user({ userid: 'unbekannt', quota: quota('unknown') }),
    ];
    const result = sortUsers(users, { feld: 'quota', richtung: 'aufsteigend' });
    expect(result.map((u) => u.userid)).toEqual(['leer', 'voll', 'unbegrenzt', 'unbekannt']);
  });

  it('Quota-Sortierung: unbegrenzt und unbekannt landen auch absteigend am Ende', () => {
    const users = [
      user({ userid: 'voll', quota: quota('limited', 95) }),
      user({ userid: 'unbegrenzt', quota: quota('unlimited') }),
      user({ userid: 'leer', quota: quota('limited', 10) }),
      user({ userid: 'unbekannt', quota: quota('unknown') }),
    ];
    const result = sortUsers(users, { feld: 'quota', richtung: 'absteigend' });
    expect(result.map((u) => u.userid)).toEqual(['voll', 'leer', 'unbegrenzt', 'unbekannt']);
  });

  it('mutiert die Eingabeliste nicht', () => {
    const input = [user({ userid: 'b' }), user({ userid: 'a' })];
    const copy = [...input];
    sortUsers(input, { feld: 'userid', richtung: 'aufsteigend' });
    expect(input).toEqual(copy);
  });

  it('stabil bei Gleichstand im displayname', () => {
    const result = sortUsers(
      [
        user({ userid: 'b', displayname: 'Team' }),
        user({ userid: 'a', displayname: 'Team' }),
      ],
      { feld: 'displayname', richtung: 'aufsteigend' },
    );
    expect(result.map((u) => u.userid)).toEqual(['b', 'a']);
  });

  it('stabil bei Gleichstand im usagePercent', () => {
    const result = sortUsers(
      [
        user({ userid: 'b', quota: quota('limited', 50) }),
        user({ userid: 'a', quota: quota('limited', 50) }),
      ],
      { feld: 'quota', richtung: 'aufsteigend' },
    );
    expect(result.map((u) => u.userid)).toEqual(['b', 'a']);
  });

  it('Zuletzt gesehen: ohne Login immer am Ende, sonst nach Zeitstempel', () => {
    const users = [
      user({ userid: 'neu', lastSeenMs: 300 }),
      user({ userid: 'nie', lastSeenMs: null }),
      user({ userid: 'alt', lastSeenMs: 100 }),
    ];
    expect(sortUsers(users, { feld: 'lastSeen', richtung: 'aufsteigend' }).map((u) => u.userid))
      .toEqual(['alt', 'neu', 'nie']);
    expect(sortUsers(users, { feld: 'lastSeen', richtung: 'absteigend' }).map((u) => u.userid))
      .toEqual(['neu', 'alt', 'nie']);
  });

  it('rest-Gruppe (unbegrenzt/unbekannt) behält die Eingabereihenfolge', () => {
    const result = sortUsers(
      [
        user({ userid: 'unbekannt1', quota: quota('unknown') }),
        user({ userid: 'unbegrenzt1', quota: quota('unlimited') }),
        user({ userid: 'unbekannt2', quota: quota('unknown') }),
      ],
      { feld: 'quota', richtung: 'aufsteigend' },
    );
    expect(result.map((u) => u.userid)).toEqual(['unbekannt1', 'unbegrenzt1', 'unbekannt2']);
  });
});

describe('filterUsers', () => {
  const users = [
    user({ userid: 'anna', displayname: 'Anna', groups: ['lehrer'], enabled: true, quota: quota('limited', 95) }),
    user({ userid: 'bert', displayname: 'Bert', groups: ['schueler'], enabled: false, quota: quota('unlimited') }),
    user({ userid: 'cora', displayname: 'Cora', groups: ['lehrer'], enabled: true, quota: quota('unknown') }),
  ];

  it('Kriterium suche allein', () => {
    const result = filterUsers(users, { suche: 'bert', gruppe: null, status: 'alle', quotaStufe: null });
    expect(result.map((u) => u.userid)).toEqual(['bert']);
  });

  it('Kriterium gruppe allein', () => {
    const result = filterUsers(users, { suche: '', gruppe: 'lehrer', status: 'alle', quotaStufe: null });
    expect(result.map((u) => u.userid)).toEqual(['anna', 'cora']);
  });

  it('Kriterium status allein', () => {
    const result = filterUsers(users, { suche: '', gruppe: null, status: 'deaktiviert', quotaStufe: null });
    expect(result.map((u) => u.userid)).toEqual(['bert']);
  });

  it('Kriterium quotaStufe allein', () => {
    const result = filterUsers(users, { suche: '', gruppe: null, status: 'alle', quotaStufe: 'ueber90' });
    expect(result.map((u) => u.userid)).toEqual(['anna']);
  });

  it('zwei Kriterien (gruppe und quotaStufe) UND-verknüpft', () => {
    const result = filterUsers(users, { suche: '', gruppe: 'lehrer', status: 'alle', quotaStufe: 'unbekannt' });
    expect(result.map((u) => u.userid)).toEqual(['cora']);
  });

  it('alle null/\'alle\' -> unveränderte Menge', () => {
    const result = filterUsers(users, { suche: '', gruppe: null, status: 'alle', quotaStufe: null });
    expect(result.map((u) => u.userid)).toEqual(['anna', 'bert', 'cora']);
  });

  it('gibt eine neue Liste zurück und mutiert die Eingabe nicht', () => {
    const copy = [...users];
    const result = filterUsers(users, { suche: '', gruppe: null, status: 'alle', quotaStufe: null });
    expect(result).not.toBe(users);
    expect(users).toEqual(copy);
  });
});

describe('pruneAuswahl', () => {
  it('entfernt userids, die nicht im Filterergebnis sind', () => {
    const auswahl = ['anna', 'bert', 'cora'];
    const gefilterte = [user({ userid: 'bert' })];
    expect(pruneAuswahl(auswahl, gefilterte)).toEqual(['bert']);
  });

  it('akzeptiert ein Set und liefert ein Array', () => {
    const auswahl = new Set(['anna', 'bert']);
    const gefilterte = [user({ userid: 'anna' }), user({ userid: 'bert' })];
    expect(pruneAuswahl(auswahl, gefilterte)).toEqual(['anna', 'bert']);
  });

  it('leeres Filterergebnis -> leeres Array', () => {
    expect(pruneAuswahl(['anna', 'bert'], [])).toEqual([]);
  });

  it('userid, die nach einem Neuladen nicht mehr existiert, fällt heraus (Grund für String-Auswahl statt Objektreferenzen)', () => {
    const auswahl = ['altUser', 'bert'];
    const gefilterte = [user({ userid: 'bert' })];
    expect(pruneAuswahl(auswahl, gefilterte)).toEqual(['bert']);
  });
});

describe('gruppenOptionen', () => {
  it('dedupliziert Gruppen über mehrere User', () => {
    const result = gruppenOptionen([
      user({ groups: ['lehrer', 'schueler'] }),
      user({ groups: ['lehrer'] }),
    ]);
    expect(result).toEqual(['lehrer', 'schueler']);
  });

  it('sortiert alphabetisch mit deutscher Umlaut-Reihenfolge', () => {
    const result = gruppenOptionen([user({ groups: ['Zoo', 'Ärzte', 'Bauer'] })]);
    expect(result).toEqual(['Ärzte', 'Bauer', 'Zoo']);
  });

  it('User mit leerem groups-Array liefert keine Einträge', () => {
    expect(gruppenOptionen([user({ groups: [] })])).toEqual([]);
  });

  it('User mit fehlendem groups-Feld wirft nicht und liefert keine Einträge', () => {
    const ohneGroups = user();
    delete ohneGroups.groups;
    expect(() => gruppenOptionen([ohneGroups])).not.toThrow();
    expect(gruppenOptionen([ohneGroups])).toEqual([]);
  });
});

describe('gruppenDerUser', () => {
  const liste = [
    user({ userid: 'alice', groups: ['lehrer', 'schueler'] }),
    user({ userid: 'bob', groups: ['eltern'] }),
  ];

  it('liefert nur die Gruppen des einen Users, nicht die der übrigen Liste', () => {
    expect(gruppenDerUser(liste, ['alice'])).toEqual(['lehrer', 'schueler']);
  });

  it('vereinigt bei mehreren Usern nur deren Mitgliedschaften', () => {
    expect(gruppenDerUser(liste, ['alice', 'bob'])).toEqual(['eltern', 'lehrer', 'schueler']);
  });

  it('User ohne Gruppen liefert eine leere Liste', () => {
    expect(gruppenDerUser([user({ userid: 'carl', groups: [] })], ['carl'])).toEqual([]);
  });
});

describe('alleAusgewaehlt', () => {
  it('true, wenn jeder sichtbare User ausgewählt ist', () => {
    const gefilterte = [user({ userid: 'a' }), user({ userid: 'b' })];
    expect(alleAusgewaehlt(new Set(['a', 'b']), gefilterte)).toBe(true);
  });

  it('false, wenn mindestens ein sichtbarer User fehlt', () => {
    const gefilterte = [user({ userid: 'a' }), user({ userid: 'b' })];
    expect(alleAusgewaehlt(new Set(['a']), gefilterte)).toBe(false);
  });

  it('leeres Filterergebnis gilt nicht als "alle ausgewählt"', () => {
    expect(alleAusgewaehlt(new Set(), [])).toBe(false);
    expect(alleAusgewaehlt(new Set(['a']), [])).toBe(false);
  });
});

describe('seitenAusschnitt', () => {
  const liste = Array.from({ length: 250 }, (_, i) => i);

  it('erlaubt genau 100, 150, 200 und 400', () => {
    expect(SEITEN_GROESSEN).toEqual([100, 150, 200, 400]);
  });

  it('erste Seite mit 100 liefert die ersten 100 Einträge', () => {
    const seite = seitenAusschnitt(liste, 1, 100);
    expect(seite.eintraege).toEqual(liste.slice(0, 100));
    expect(seite).toMatchObject({ seite: 1, seiten: 3, von: 1, bis: 100, gesamt: 250 });
  });

  it('letzte unvollständige Seite liefert den Rest', () => {
    const seite = seitenAusschnitt(liste, 2, 150);
    expect(seite.eintraege).toEqual(liste.slice(150));
    expect(seite).toMatchObject({ seite: 2, seiten: 2, von: 151, bis: 250, gesamt: 250 });
  });

  it('eine Seite hinter der letzten wird auf die letzte gezogen', () => {
    const seite = seitenAusschnitt(liste, 9, 100);
    expect(seite.eintraege).toEqual(liste.slice(200));
    expect(seite.seite).toBe(3);
  });

  it('leere Liste bleibt eine leere Seite', () => {
    expect(seitenAusschnitt([], 4, 100)).toEqual({
      eintraege: [], seite: 1, seiten: 1, von: 0, bis: 0, gesamt: 0,
    });
  });

  it('unbekannte Seitengröße fällt auf 100 zurück', () => {
    expect(seitenAusschnitt(liste, 1, 80).bis).toBe(100);
  });

  it('verändert die Eingabeliste nicht', () => {
    const vorher = [...liste];
    seitenAusschnitt(liste, 1, 100);
    expect(liste).toEqual(vorher);
  });
});
