// S12 A2: groupViews, membersOf, nichtMitgliederVon, istGruppeLoeschbar - pure, kein I/O.
import { describe, expect, it } from 'vitest';
import { groupViews, membersOf, nichtMitgliederVon, istGruppeLoeschbar } from '../src/shared/groups.js';

function quota() {
  return { kind: 'unknown', limitBytes: null, usedBytes: null, usagePercent: null, roh: null };
}

function user(overrides = {}) {
  return {
    userid: 'bob', displayname: 'Bob', email: null, enabled: true, groups: [],
    quota: quota(), ...overrides,
  };
}

describe('groupViews', () => {
  it('zählt Mitglieder korrekt über mehrere User', () => {
    const users = [
      user({ userid: 'a', groups: ['lehrer'] }),
      user({ userid: 'b', groups: ['lehrer', 'schueler'] }),
      user({ userid: 'c', groups: ['schueler'] }),
    ];
    const result = groupViews(users, ['lehrer', 'schueler']);
    expect(result).toEqual([
      { id: 'lehrer', memberCount: 2, istAdmin: false },
      { id: 'schueler', memberCount: 2, istAdmin: false },
    ]);
  });

  it('eine Gruppe ohne Mitglieder bleibt mit memberCount 0 enthalten', () => {
    const users = [user({ userid: 'a', groups: ['lehrer'] })];
    const result = groupViews(users, ['lehrer', 'leere-gruppe']);
    expect(result).toContainEqual({ id: 'leere-gruppe', memberCount: 0, istAdmin: false });
  });

  it('istAdmin ist nur für die Gruppe admin true', () => {
    const result = groupViews([], ['admin', 'administratoren']);
    expect(result).toEqual([
      { id: 'admin', memberCount: 0, istAdmin: true },
      { id: 'administratoren', memberCount: 0, istAdmin: false },
    ]);
  });

  it('Vergleich exakt: ein User in Lehrer zählt nicht für lehrer', () => {
    const users = [user({ userid: 'a', groups: ['Lehrer'] })];
    const result = groupViews(users, ['lehrer', 'Lehrer']);
    expect(result).toEqual([
      { id: 'lehrer', memberCount: 0, istAdmin: false },
      { id: 'Lehrer', memberCount: 1, istAdmin: false },
    ]);
  });

  it('Lehrer und lehrer sind eigenständige Gruppen mit je genau einem Mitglied', () => {
    const users = [
      user({ userid: 'a', displayname: 'Anna', groups: ['Lehrer'] }),
      user({ userid: 'b', displayname: 'Bernd', groups: ['lehrer'] }),
    ];
    const result = groupViews(users, ['Lehrer', 'lehrer']);
    expect(result).toEqual([
      { id: 'Lehrer', memberCount: 1, istAdmin: false },
      { id: 'lehrer', memberCount: 1, istAdmin: false },
    ]);
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
