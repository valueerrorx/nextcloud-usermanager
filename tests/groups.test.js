// S12 A2: groupViews, membersOf, nichtMitgliederVon, istGruppeLoeschbar - pure, kein I/O.
import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import {
  groupViews, filterGroups, membersOf, nichtMitgliederVon, istGruppeLoeschbar, planGruppeMitMitgliedern,
  entscheideGruppeLoeschen, gruppeNichtGeloeschtText, gruppenAusDetails, gruppenAnzeigename, gruppenKurztext,
  plainGroupIds,
} from '../src/shared/groups.js';

function quota() {
  return { kind: 'unknown', limitBytes: null, usedBytes: null, usagePercent: null, roh: null };
}

function user(overrides = {}) {
  return {
    userid: 'bob', displayname: 'Bob', email: null, enabled: true, groups: [],
    quota: quota(), ...overrides,
  };
}

function gruppe(id, displayname = id) {
  return { id, displayname };
}

describe('groupViews', () => {
  it('zählt Mitglieder korrekt über mehrere User', () => {
    const users = [
      user({ userid: 'a', groups: ['lehrer'] }),
      user({ userid: 'b', groups: ['lehrer', 'schueler'] }),
      user({ userid: 'c', groups: ['schueler'] }),
    ];
    const result = groupViews(users, [gruppe('lehrer', 'Lehrer'), gruppe('schueler')]);
    expect(result).toEqual([
      { id: 'lehrer', displayname: 'Lehrer', memberCount: 2, istAdmin: false },
      { id: 'schueler', displayname: 'schueler', memberCount: 2, istAdmin: false },
    ]);
  });

  it('eine Gruppe ohne Mitglieder bleibt mit memberCount 0 enthalten', () => {
    const users = [user({ userid: 'a', groups: ['lehrer'] })];
    const result = groupViews(users, [gruppe('lehrer'), gruppe('leere-gruppe')]);
    expect(result).toContainEqual({ id: 'leere-gruppe', displayname: 'leere-gruppe', memberCount: 0, istAdmin: false });
  });

  it('istAdmin ist nur für die Gruppe admin true', () => {
    const result = groupViews([], [gruppe('admin'), gruppe('administratoren')]);
    expect(result).toEqual([
      { id: 'admin', displayname: 'admin', memberCount: 0, istAdmin: true },
      { id: 'administratoren', displayname: 'administratoren', memberCount: 0, istAdmin: false },
    ]);
  });

  it('Vergleich exakt: ein User in Lehrer zählt nicht für lehrer', () => {
    const users = [user({ userid: 'a', groups: ['Lehrer'] })];
    const result = groupViews(users, [gruppe('lehrer'), gruppe('Lehrer', 'Lehrkräfte')]);
    expect(result).toEqual([
      { id: 'lehrer', displayname: 'lehrer', memberCount: 0, istAdmin: false },
      { id: 'Lehrer', displayname: 'Lehrkräfte', memberCount: 1, istAdmin: false },
    ]);
  });

  it('Lehrer und lehrer sind eigenständige Gruppen mit je genau einem Mitglied', () => {
    const users = [
      user({ userid: 'a', displayname: 'Anna', groups: ['Lehrer'] }),
      user({ userid: 'b', displayname: 'Bernd', groups: ['lehrer'] }),
    ];
    const result = groupViews(users, [gruppe('Lehrer'), gruppe('lehrer')]);
    expect(result).toEqual([
      { id: 'Lehrer', displayname: 'Lehrer', memberCount: 1, istAdmin: false },
      { id: 'lehrer', displayname: 'lehrer', memberCount: 1, istAdmin: false },
    ]);
  });
});

describe('gruppenAusDetails', () => {
  it('übernimmt id und displayname aus der Details-Antwort', () => {
    expect(gruppenAusDetails([
      { id: '2026-1C', displayname: 'Klasse 1C', usercount: 12 },
    ])).toEqual([{ id: '2026-1C', displayname: 'Klasse 1C' }]);
  });

  it('fehlender oder leerer displayname fällt auf die id zurück', () => {
    expect(gruppenAusDetails([
      { id: 'lehrer' },
      { id: 'schueler', displayname: '   ' },
    ])).toEqual([
      { id: 'lehrer', displayname: 'lehrer' },
      { id: 'schueler', displayname: 'schueler' },
    ]);
  });

  it('Einträge ohne id werden verworfen, kein Array liefert []', () => {
    expect(gruppenAusDetails([{ displayname: 'ohne id' }, null, 'lehrer'])).toEqual([]);
    expect(gruppenAusDetails(undefined)).toEqual([]);
  });
});

describe('gruppenAnzeigename', () => {
  it('liefert den displayname zur id und sonst die id selbst', () => {
    const katalog = [{ id: '2026-1C', displayname: 'Klasse 1C' }];
    expect(gruppenAnzeigename(katalog, '2026-1C')).toBe('Klasse 1C');
    expect(gruppenAnzeigename(katalog, 'unbekannt')).toBe('unbekannt');
  });
});

describe('gruppenKurztext', () => {
  it('hängt die id nur an, wenn der Anzeigename davon abweicht', () => {
    const katalog = [{ id: '2026-1C', displayname: 'Klasse 1C' }, { id: 'lehrer', displayname: 'lehrer' }];
    expect(gruppenKurztext(katalog, '2026-1C')).toBe('Klasse 1C (2026-1C)');
    expect(gruppenKurztext(katalog, 'lehrer')).toBe('lehrer');
  });
});

describe('membersOf', () => {
  it('liefert nur die Mitglieder der angefragten Gruppe', () => {
    const users = [
      user({ userid: 'a', displayname: 'Anna', groups: ['lehrer'] }),
      user({ userid: 'b', displayname: 'Bernd', groups: ['schueler'] }),
    ];
    expect(membersOf(users, 'lehrer')).toEqual([users[0]]);
  });

  it('sortiert mit Umlauten (Ärzte vor Bauer)', () => {
    const users = [
      user({ userid: 'b', displayname: 'Bauer', groups: ['g'] }),
      user({ userid: 'a', displayname: 'Ärzte', groups: ['g'] }),
    ];
    const result = membersOf(users, 'g');
    expect(result.map((u) => u.displayname)).toEqual(['Ärzte', 'Bauer']);
  });

  it('leere Gruppe liefert []', () => {
    const users = [user({ userid: 'a', groups: ['andere'] })];
    expect(membersOf(users, 'leer')).toEqual([]);
  });

  it('Vergleich exakt: lehrer liefert nicht den Lehrer-User', () => {
    const grosses = user({ userid: 'a', displayname: 'Anna', groups: ['Lehrer'] });
    const kleines = user({ userid: 'b', displayname: 'Bernd', groups: ['lehrer'] });
    const users = [grosses, kleines];
    expect(membersOf(users, 'lehrer')).toEqual([kleines]);
    expect(membersOf(users, 'Lehrer')).toEqual([grosses]);
  });
});

describe('nichtMitgliederVon', () => {
  it('liefert nur User, die nicht Mitglied sind', () => {
    const users = [
      user({ userid: 'a', groups: ['lehrer'] }),
      user({ userid: 'b', groups: [] }),
    ];
    expect(nichtMitgliederVon(users, 'lehrer')).toEqual([users[1]]);
  });

  it('sortiert mit Umlauten (Ärzte vor Bauer)', () => {
    const users = [
      user({ userid: 'b', displayname: 'Bauer', groups: [] }),
      user({ userid: 'a', displayname: 'Ärzte', groups: [] }),
    ];
    const result = nichtMitgliederVon(users, 'lehrer');
    expect(result.map((u) => u.displayname)).toEqual(['Ärzte', 'Bauer']);
  });

  it('Vergleich exakt: Mitglied von Lehrer gilt nicht als Mitglied von lehrer', () => {
    const grosses = user({ userid: 'a', displayname: 'Anna', groups: ['Lehrer'] });
    const kleines = user({ userid: 'b', displayname: 'Bernd', groups: ['lehrer'] });
    const users = [grosses, kleines];
    expect(nichtMitgliederVon(users, 'lehrer')).toEqual([grosses]);
    expect(nichtMitgliederVon(users, 'Lehrer')).toEqual([kleines]);
  });
});

describe('istGruppeLoeschbar', () => {
  it("'admin' -> false", () => {
    expect(istGruppeLoeschbar('admin')).toBe(false);
  });

  it('jede andere Gruppe -> true', () => {
    expect(istGruppeLoeschbar('lehrer')).toBe(true);
    expect(istGruppeLoeschbar('Admin')).toBe(true); // Vergleich exakt, nicht case-insensitiv
  });
});

describe('planGruppeMitMitgliedern (S18)', () => {
  const users = [
    user({ userid: 'nur', groups: ['G'] }),
    user({ userid: 'mehr', groups: ['G', 'H', 'I'] }),
    user({ userid: 'Admin', groups: ['G'] }),
    user({ userid: 'Aaron.w', groups: ['G'] }),
    user({ userid: 'aaron.w', groups: ['G', 'H'] }),
  ];
  const plan = (mitglieder, adminUserId = 'admin') => planGruppeMitMitgliedern({ gid: 'G', mitglieder, users, adminUserId });

  it('nur diese Gruppe -> zuLoeschen; weitere Gruppe -> bleiben mit Gruppennamen', () => {
    expect(plan(['nur', 'mehr'])).toEqual({
      zuLoeschen: ['nur'],
      bleiben: [{ userid: 'mehr', andereGruppen: ['H', 'I'] }],
      unbekannt: [],
    });
  });

  it('verbundener Admin wird nie gelöscht, auch bei abweichender Groß-/Kleinschreibung', () => {
    expect(plan(['Admin'], 'admin').zuLoeschen).toEqual([]);
    expect(plan(['Admin'], 'ADMIN').bleiben).toEqual([{ userid: 'Admin', andereGruppen: [] }]);
  });

  it('Mitglied nicht in users -> unbekannt, nicht gelöscht', () => {
    expect(plan(['nur', 'fremd'])).toMatchObject({ zuLoeschen: ['nur'], unbekannt: ['fremd'] });
  });

  it('Aaron.w und aaron.w sind getrennte Accounts', () => {
    expect(plan(['Aaron.w', 'aaron.w'])).toEqual({
      zuLoeschen: ['Aaron.w'],
      bleiben: [{ userid: 'aaron.w', andereGruppen: ['H'] }],
      unbekannt: [],
    });
    expect(plan(['AARON.W']).unbekannt).toEqual(['AARON.W']);
  });

  it('Gruppenvergleich exakt: Gruppe "g" ist eine andere Gruppe als "G"', () => {
    const u = [user({ userid: 'x', groups: ['G', 'g'] })];
    expect(planGruppeMitMitgliedern({ gid: 'G', mitglieder: ['x'], users: u, adminUserId: null }).bleiben)
      .toEqual([{ userid: 'x', andereGruppen: ['g'] }]);
  });
});

describe('entscheideGruppeLoeschen (S18)', () => {
  const r = (...status) => status.map((s) => ({ status: s }));

  it('keine Benutzer zu löschen -> Gruppe löschen', () => {
    expect(entscheideGruppeLoeschen({ erwartet: 0, results: null })).toEqual({ loeschen: true, nichtGeloescht: 0 });
  });
  it('alle ok -> löschen', () => {
    expect(entscheideGruppeLoeschen({ erwartet: 2, results: r('ok', 'ok') })).toEqual({ loeschen: true, nichtGeloescht: 0 });
  });
  it('ein fehler -> behalten, zählt 1', () => {
    expect(entscheideGruppeLoeschen({ erwartet: 2, results: r('ok', 'fehler') })).toEqual({ loeschen: false, nichtGeloescht: 1 });
  });
  it('ein nicht ausgeführt -> behalten', () => {
    expect(entscheideGruppeLoeschen({ erwartet: 2, results: r('ok', 'nicht ausgeführt') })).toEqual({ loeschen: false, nichtGeloescht: 1 });
  });
  it('teilweise zählt nicht als ok', () => {
    expect(entscheideGruppeLoeschen({ erwartet: 1, results: r('teilweise') }).loeschen).toBe(false);
  });
  it('Job lief nicht (kein results) oder Anzahl weicht ab -> behalten', () => {
    expect(entscheideGruppeLoeschen({ erwartet: 2, results: null })).toEqual({ loeschen: false, nichtGeloescht: 2 });
    expect(entscheideGruppeLoeschen({ erwartet: 2, results: r('ok') }).loeschen).toBe(false);
    expect(entscheideGruppeLoeschen({ erwartet: 1, results: r('ok', 'ok') })).toEqual({ loeschen: false, nichtGeloescht: 1 });
  });
  it('Text nennt die Anzahl', () => {
    expect(gruppeNichtGeloeschtText(3)).toBe('Gruppe nicht gelöscht, weil 3 Benutzer nicht gelöscht werden konnten');
  });
});

describe('filterGroups', () => {
  const gruppen = [
    { id: 'admin', displayname: 'Administratoren', istAdmin: true },
    { id: 'lehrer', displayname: 'Lehrkräfte', istAdmin: false },
    { id: '2026-1c', displayname: 'Klasse 1C', istAdmin: false },
  ];

  it('leere Suche lässt alle Gruppen stehen und kopiert die Liste', () => {
    const result = filterGroups(gruppen, { suche: '  ', status: 'alle' });
    expect(result).toEqual(gruppen);
    expect(result).not.toBe(gruppen);
  });

  it('trifft Anzeigename und Kennung, unabhängig von der Großschreibung', () => {
    expect(filterGroups(gruppen, { suche: 'lehr' }).map((g) => g.id)).toEqual(['lehrer']);
    expect(filterGroups(gruppen, { suche: '1C' }).map((g) => g.id)).toEqual(['2026-1c']);
  });

  it('Status geschuetzt lässt nur die admin-Gruppe', () => {
    expect(filterGroups(gruppen, { status: 'geschuetzt' }).map((g) => g.id)).toEqual(['admin']);
  });

  it('Status nichtGeschuetzt schließt die admin-Gruppe aus', () => {
    expect(filterGroups(gruppen, { suche: '', status: 'nichtGeschuetzt' }).map((g) => g.id)).toEqual(['lehrer', '2026-1c']);
  });

  it('Suche und Status gelten zusammen', () => {
    expect(filterGroups(gruppen, { suche: 'admin', status: 'nichtGeschuetzt' })).toEqual([]);
  });
});

describe('plainGroupIds', () => {
  it('kopiert eine Vue-Proxy-Liste in ein Array, das structured clone akzeptiert', () => {
    const gruppen = reactive(['Lehrer']);
    expect(() => structuredClone({ groups: gruppen })).toThrow(/could not be cloned/);
    const plain = plainGroupIds(gruppen);
    expect(plain).toEqual(['Lehrer']);
    expect(plain).not.toBe(gruppen);
    expect(structuredClone({ groups: plain }).groups).toEqual(['Lehrer']);
  });

  it('ohne Liste -> leeres Array', () => {
    expect(plainGroupIds(null)).toEqual([]);
    expect(plainGroupIds(undefined)).toEqual([]);
  });
});
