// S08 A1: no-ops per action, self-protection, count semantics, no-request proof.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planActions, bestaetigungPasst, planToItems, removeJobParams } from '../src/shared/dryRun.js';

import { parseQuota } from '../src/shared/quota.js';

const ADMIN = 'Admin';

function buildUser(overrides = {}) {
  return {
    userid: 'alice',
    displayname: 'Alice Example',
    email: 'alice@example.test',
    enabled: true,
    groups: ['gruppe-a'],
    quota: { kind: 'limited', limitBytes: 1073741824, usedBytes: 1000, usagePercent: 0.1, roh: {} },
    istVerbundenerAdmin: false,
    ...overrides,
  };
}

function plan({ users, auswahl, action, params = {}, adminUserId = ADMIN }) {
  return planActions({ users, auswahl, action, params, adminUserId });
}

describe('planActions — No-Op pro Aktion (A1), landet in keineAenderung und nicht in auszufuehren', () => {
  const cases = [
    {
      name: 'user.enable auf bereits aktiven User -> bereits_aktiv',
      action: 'user.enable',
      params: {},
      user: buildUser({ enabled: true }),
      grund: 'bereits_aktiv',
    },
    {
      name: 'user.disable auf bereits deaktivierten User -> bereits_deaktiviert',
      action: 'user.disable',
      params: {},
      user: buildUser({ enabled: false }),
      grund: 'bereits_deaktiviert',
    },
    {
      name: 'user.addToGroup auf User, der schon in der Gruppe ist -> bereits_in_gruppe',
      action: 'user.addToGroup',
      params: { groupid: 'gruppe-a' },
      user: buildUser({ groups: ['gruppe-a'] }),
      grund: 'bereits_in_gruppe',
    },
    {
      name: 'user.removeFromGroup auf User, der nicht in der Gruppe ist -> nicht_in_gruppe',
      action: 'user.removeFromGroup',
      params: { groupid: 'gruppe-b' },
      user: buildUser({ groups: ['gruppe-a'] }),
      grund: 'nicht_in_gruppe',
    },
    {
      name: 'user.setQuota mit dem bereits aktuellen Wert -> kontingent_unveraendert',
      action: 'user.setQuota',
      params: { value: '1073741824' },
      user: buildUser({ quota: { kind: 'limited', limitBytes: 1073741824, usedBytes: 0, usagePercent: 0, roh: {} } }),
      grund: 'kontingent_unveraendert',
    },
    {
      name: 'user.setQuota mit unbegrenzt auf bereits unbegrenzten User -> kontingent_unveraendert',
      action: 'user.setQuota',
      params: { value: 'none' },
      user: buildUser({ quota: { kind: 'unlimited', limitBytes: null, usedBytes: 0, usagePercent: null, roh: {} } }),
      grund: 'kontingent_unveraendert',
    },
    {
      name: 'user.update ohne geändertes Feld -> keine_felder_geaendert',
      action: 'user.update',
      params: { displayname: 'Alice Example', email: 'alice@example.test' },
      user: buildUser({ displayname: 'Alice Example', email: 'alice@example.test' }),
      grund: 'keine_felder_geaendert',
    },
  ];

  for (const { name, action, params, user, grund } of cases) {
    it(name, () => {
      const result = plan({ users: [user], auswahl: [user.userid], action, params });
      expect(result.keineAenderung).toHaveLength(1);
      expect(result.keineAenderung[0].grund).toBe(grund);
      expect(result.auszufuehren).toHaveLength(0);
      expect(result.anzahl).toBe(0);
    });
  }
});

describe('planActions — user.setPassword und user.delete haben keine No-Op-Erkennung', () => {
  it('user.setPassword landet immer in auszufuehren', () => {
    const user = buildUser();
    const result = plan({ users: [user], auswahl: [user.userid], action: 'user.setPassword', params: { value: 'NeuesPasswort123!' } });
    expect(result.auszufuehren).toHaveLength(1);
    expect(result.keineAenderung).toHaveLength(0);
  });

  it('user.delete landet immer in auszufuehren', () => {
    const user = buildUser();
    const result = plan({ users: [user], auswahl: [user.userid], action: 'user.delete' });
    expect(result.auszufuehren).toHaveLength(1);
    expect(result.keineAenderung).toHaveLength(0);
  });
});

describe('planActions — anzahl === auszufuehren.length, nicht die Größe der Rohauswahl', () => {
  it('Pflichttest: 5 ausgewählt, 2 No-Ops, 1 Selbstschutz -> anzahl === 2', () => {
    const users = [
      buildUser({ userid: ADMIN, enabled: true }), // self-protection on disable
      buildUser({ userid: 'bob', enabled: false }), // no-op: already disabled
      buildUser({ userid: 'carol', enabled: false }), // no-op: already disabled
      buildUser({ userid: 'dave', enabled: true }), // to execute
      buildUser({ userid: 'erin', enabled: true }), // to execute
    ];
    const result = plan({ users, auswahl: [ADMIN, 'bob', 'carol', 'dave', 'erin'], action: 'user.disable' });

    expect(result.auszufuehren).toHaveLength(2);
    expect(result.anzahl).toBe(2);
    expect(result.anzahl).not.toBe(5); // not the raw selection size
    expect(result.keineAenderung).toHaveLength(2);
    expect(result.ausgeschlossen).toHaveLength(1);
  });
});

describe('planActions — Selbstschutz nur bei delete/disable, case-insensitiv über adminUserId (ARCHITECTURE §5)', () => {
  it('user.delete: Admin "Aaron.w" wird case-insensitiv gegen adminUserId "aaron.w" ausgeschlossen', () => {
    const user = buildUser({ userid: 'Aaron.w' });
    const result = plan({ users: [user], auswahl: ['Aaron.w'], action: 'user.delete', adminUserId: 'aaron.w' });
    expect(result.ausgeschlossen).toEqual([{ userid: 'Aaron.w', vorher: null, nachher: null, grund: 'selbstschutz_admin' }]);
    expect(result.auszufuehren).toHaveLength(0);
  });

  it('user.disable: derselbe Admin-Account wird ausgeschlossen', () => {
    const user = buildUser({ userid: 'Aaron.w' });
    const result = plan({ users: [user], auswahl: ['Aaron.w'], action: 'user.disable', adminUserId: 'aaron.w' });
    expect(result.ausgeschlossen).toHaveLength(1);
    expect(result.ausgeschlossen[0].grund).toBe('selbstschutz_admin');
  });

  it('user.enable: der Admin ist NICHT ausgeschlossen', () => {
    const user = buildUser({ userid: 'Aaron.w', enabled: false });
    const result = plan({ users: [user], auswahl: ['Aaron.w'], action: 'user.enable', adminUserId: 'aaron.w' });
    expect(result.ausgeschlossen).toHaveLength(0);
    expect(result.auszufuehren).toHaveLength(1);
  });
});

describe('planActions — rein lokal, kein Request (verhaltensbasiert, kein Quelltext-Regex)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Review-Fix: ein client.request-Spy in params.value wäre vacuous - dryRun.js liest params
  // nie als Objekt mit einer request()-Methode, der Spy könnte also nie aufgerufen werden, egal
  // wie die Implementierung aussieht. Nur der globale fetch-Stub ist eine echte Zusicherung.
  it('das globale fetch wird nie aufgerufen', () => {
    const throwingFetch = vi.fn(() => {
      throw new Error('dryRun.js must never perform network I/O');
    });
    vi.stubGlobal('fetch', throwingFetch);

    const users = [
      buildUser({ userid: 'alice' }),
      buildUser({ userid: 'bob', enabled: false }),
      buildUser({ userid: 'carol', groups: [] }),
    ];
    plan({ users, auswahl: ['alice'], action: 'user.enable' });
    plan({ users, auswahl: ['bob'], action: 'user.disable' });
    plan({ users, auswahl: ['carol'], action: 'user.delete' });

    expect(throwingFetch).not.toHaveBeenCalled();
  });
});

describe('planActions — vorher/nachher nutzen formatBytes für Kontingente', () => {
  it('user.setQuota auf einen anderen Preset-Wert zeigt formatBytes-Text in vorher/nachher', () => {
    const user = buildUser({ quota: { kind: 'limited', limitBytes: 1073741824, usedBytes: 0, usagePercent: 0, roh: {} } });
    const result = plan({ users: [user], auswahl: [user.userid], action: 'user.setQuota', params: { value: '2147483648' } });
    expect(result.auszufuehren).toEqual([{ userid: 'alice', vorher: '1,0 GiB', nachher: '2,0 GiB' }]);
  });

  it('user.setQuota auf unbegrenzt zeigt "unbegrenzt" statt formatBytes(null)', () => {
    const user = buildUser({ quota: { kind: 'limited', limitBytes: 1073741824, usedBytes: 0, usagePercent: 0, roh: {} } });
    const result = plan({ users: [user], auswahl: [user.userid], action: 'user.setQuota', params: { value: 'none' } });
    expect(result.auszufuehren[0].nachher).toBe('unbegrenzt');
  });
});

describe('planActions — user.setQuota mit "default" (Standard-Kontingent)', () => {
  it('führt für unbegrenzte, begrenzte und unbekannte (quota 0) User aus, Label ohne NaN', () => {
    const unbegrenzt = buildUser({ userid: 'u1', quota: { kind: 'unlimited', limitBytes: null, usedBytes: 0, usagePercent: 0, roh: {} } });
    const begrenzt = buildUser({ userid: 'u2' });
    const unbekannt = buildUser({ userid: 'u3', quota: parseQuota(0) });
    const result = plan({
      users: [unbegrenzt, begrenzt, unbekannt],
      auswahl: ['u1', 'u2', 'u3'],
      action: 'user.setQuota',
      params: { value: 'default' },
    });
    expect(result.auszufuehren.map((e) => e.userid)).toEqual(['u1', 'u2', 'u3']);
    expect(result.keineAenderung).toHaveLength(0);
    for (const eintrag of result.auszufuehren) {
      expect(eintrag.nachher).toBe('Standard-Kontingent (Server)');
      expect(JSON.stringify(eintrag)).not.toMatch(/NaN/);
    }
  });
});

describe('planActions — Lookup ist ein exakter Match, nicht case-insensitiv (Review: Data-Safety #1)', () => {
  it('Auswahl "alice" matcht nicht die Zeile von "Alice" (anderes Casing)', () => {
    const user = buildUser({ userid: 'Alice' });
    const result = plan({ users: [user], auswahl: ['alice'], action: 'user.enable' });
    expect(result.auszufuehren).toHaveLength(0);
    expect(result.ausgeschlossen).toEqual([{ userid: 'alice', vorher: null, nachher: null, grund: 'nicht_gefunden' }]);
  });
});

describe('planActions — Auswahl ohne Treffer in der geladenen Liste landet in ausgeschlossen (Review: Data-Safety #2)', () => {
  it('ein userid außerhalb der geladenen Liste wird nicht stillschweigend fallengelassen', () => {
    const user = buildUser({ userid: 'alice', enabled: false }); // enabled:false, sonst wäre enable ein No-Op
    const result = plan({ users: [user], auswahl: ['alice', 'geist'], action: 'user.enable' });
    expect(result.ausgeschlossen).toEqual([{ userid: 'geist', vorher: null, nachher: null, grund: 'nicht_gefunden' }]);
    expect(result.auszufuehren).toHaveLength(1);
    expect(result.anzahl).toBe(1);
  });
});

describe('planActions — adminUserId: null wirft nicht (Review: Data-Safety #3, ActionBar.vue-Prop-Default)', () => {
  it('user.delete mit adminUserId: null wirft nicht und schließt niemanden per Selbstschutz aus', () => {
    const user = buildUser({ userid: 'alice' });
    expect(() => plan({ users: [user], auswahl: ['alice'], action: 'user.delete', adminUserId: null })).not.toThrow();
    const result = plan({ users: [user], auswahl: ['alice'], action: 'user.delete', adminUserId: null });
    expect(result.ausgeschlossen).toHaveLength(0);
    expect(result.auszufuehren).toHaveLength(1);
  });
});

describe('planActions — kein Passwort-Leak im Plan (Review #13, user.setPassword)', () => {
  it('weder vorher, nachher noch grund enthalten das Passwort aus params.value', () => {
    const geheim = 'TopSecret123!';
    const user = buildUser();
    const result = plan({ users: [user], auswahl: [user.userid], action: 'user.setPassword', params: { value: geheim } });
    expect(JSON.stringify(result)).not.toContain(geheim);
  });
});

describe('bestaetigungPasst — Löschbestätigungs-Prädikat (Review: Extraktion #1)', () => {
  it('falscher Wert -> false', () => {
    expect(bestaetigungPasst('3', 5)).toBe(false);
  });

  it('richtiger Wert -> true', () => {
    expect(bestaetigungPasst('5', 5)).toBe(true);
  });

  it('umgebender Leerraum wird getrimmt', () => {
    expect(bestaetigungPasst('  5  ', 5)).toBe(true);
  });

  it('gilt auch bei anzahl === 1', () => {
    expect(bestaetigungPasst('1', 1)).toBe(true);
    expect(bestaetigungPasst('2', 1)).toBe(false);
  });

  it('leere Eingabe -> false', () => {
    expect(bestaetigungPasst('', 5)).toBe(false);
  });
});

describe('planActions — Gruppenanzeige', () => {
  it('nennt den aktuellen Anzeigenamen und die id, wenn sie abweichen', () => {
    const result = planActions({
      users: [buildUser({ groups: [] })],
      auswahl: ['alice'],
      action: 'user.addToGroup',
      params: { groupid: '2026-1C' },
      adminUserId: ADMIN,
      gruppen: [{ id: '2026-1C', displayname: 'Klasse 1C' }],
    });
    expect(result.auszufuehren[0].nachher).toBe('Klasse 1C (2026-1C)');
  });
});

describe('planActions — user.removeFromGroup mit mehreren Gruppen', () => {
  it('entfernt nur die gewählten Mitgliedschaften und lässt die übrigen stehen', () => {
    const result = plan({
      users: [buildUser({ groups: ['gruppe-a', 'gruppe-b', 'gruppe-c'] })],
      auswahl: ['alice'],
      action: 'user.removeFromGroup',
      params: { groupids: ['gruppe-a', 'gruppe-c'] },
    });
    expect(result.auszufuehren).toEqual([
      { userid: 'alice', vorher: 'gruppe-a, gruppe-b, gruppe-c', nachher: 'gruppe-b' },
    ]);
    expect(result.keineAenderung).toEqual([]);
  });

  it('User, der in keiner gewählten Gruppe ist, bleibt eine No-Op', () => {
    const result = plan({
      users: [buildUser({ groups: ['gruppe-a'] })],
      auswahl: ['alice'],
      action: 'user.removeFromGroup',
      params: { groupids: ['gruppe-c'] },
    });
    expect(result.auszufuehren).toEqual([]);
    expect(result.keineAenderung[0].grund).toBe('nicht_in_gruppe');
  });

  it('im Batch führt nur aus, wer mindestens eine gewählte Gruppe hat', () => {
    const users = [
      buildUser({ userid: 'alice', groups: ['gruppe-a', 'gruppe-b'] }),
      buildUser({ userid: 'bob', groups: ['gruppe-c'] }),
    ];
    const result = plan({
      users,
      auswahl: ['alice', 'bob'],
      action: 'user.removeFromGroup',
      params: { groupids: ['gruppe-a'] },
    });
    expect(result.auszufuehren.map((e) => e.userid)).toEqual(['alice']);
    expect(result.keineAenderung.map((e) => e.userid)).toEqual(['bob']);
  });
});

describe('removeJobParams', () => {
  it('gibt pro User nur die gewählten Gruppen, in denen er wirklich ist', () => {
    const users = [
      buildUser({ userid: 'alice', groups: ['gruppe-a', 'gruppe-b'] }),
      buildUser({ userid: 'bob', groups: ['gruppe-c'] }),
    ];
    expect(removeJobParams(users, ['alice', 'bob'], ['gruppe-a', 'gruppe-c'])).toEqual({
      groupidsByUserid: { alice: ['gruppe-a'], bob: ['gruppe-c'] },
    });
  });
});

describe('planToItems — nur auszufuehren, nie die rohe Auswahl (Review: Extraktion #2)', () => {
  it('liefert genau die userids aus plan.auszufuehren', () => {
    const planObjekt = {
      auszufuehren: [{ userid: 'dave', vorher: null, nachher: null }, { userid: 'erin', vorher: null, nachher: null }],
      keineAenderung: [],
      ausgeschlossen: [],
      anzahl: 2,
    };
    expect(planToItems(planObjekt)).toEqual(['dave', 'erin']);
  });

  it('No-Ops und Ausgeschlossene aus der Rohauswahl tauchen nie in items auf', () => {
    const users = [
      buildUser({ userid: ADMIN, enabled: true }),
      buildUser({ userid: 'bob', enabled: false }),
      buildUser({ userid: 'dave', enabled: true }),
    ];
    const result = plan({ users, auswahl: [ADMIN, 'bob', 'dave'], action: 'user.disable' });
    expect(planToItems(result)).toEqual(['dave']);
  });
});
