// S13: die vier Speicherwerte am Pflichtfixture, istFastVoll-Grenzwerte, fastVollListe
// Sortierung/Kappung, userCounts, historyCounts mit teilweise, pushJobHistorie, kein Request.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, parseQuota } from '../src/shared/quota.js';
import {
  accentStyle, dashboardCards, fastVollListe, historyCounts, istFastVoll, pushJobHistorie, storageTotals, userCounts,
} from '../src/shared/dashboard.js';

function user(overrides = {}) {
  return {
    userid: 'bob', displayname: 'Bob', email: null, enabled: true, groups: [],
    quota: parseQuota(null), ...overrides,
  };
}

// Das Pflichtfixture aus der Step-Spec, mit der ECHTEN parseQuota statt handgebauten QuotaInfo-
// Objekten - die erwartete Summe hängt davon ab, ob quota: 0 ein usedBytes mitliefert.
const fixture = [
  user({ userid: 'a.unbegrenzt', quota: parseQuota({ quota: -3, used: 1000 }) }),
  user({ userid: 'b.unbekannt', quota: parseQuota({ quota: 0, used: 500 }) }),
  user({ userid: 'c.voll', quota: parseQuota({ quota: 1000, used: 950 }) }),
  user({ userid: 'd.halb', quota: parseQuota({ quota: 1000, used: 500 }) }),
];

describe('storageTotals — Pflichtfixture', () => {
  it('b.unbekannt liefert kein usedBytes (quota: 0 ist unknown, parseQuota verwirft used dort)', () => {
    expect(fixture[1].quota).toMatchObject({ kind: 'unknown', usedBytes: null });
  });

  it('genutztBytes summiert 1000 + 950 + 500 = 2450 (b.unbekannt zählt nicht mit, siehe oben)', () => {
    expect(storageTotals(fixture).genutztBytes).toBe(2450);
  });

  it('summeBegrenztBytes zählt nur die zwei limited-User mit limitBytes > 0: 1000 + 1000 = 2000', () => {
    expect(storageTotals(fixture).summeBegrenztBytes).toBe(2000);
  });

  it('anzahlUnbegrenzt === 1, anzahlUnbekannt === 1', () => {
    expect(storageTotals(fixture)).toMatchObject({ anzahlUnbegrenzt: 1, anzahlUnbekannt: 1 });
  });

  it('leere Liste liefert vier Nullen statt zu werfen', () => {
    expect(storageTotals([])).toEqual({
      genutztBytes: 0, summeBegrenztBytes: 0, anzahlUnbegrenzt: 0, anzahlUnbekannt: 0,
    });
  });

  // Der nie eingeloggte User (limited, aber usedBytes: null) zählt zu summeBegrenztBytes (das
  // Kontingent ist ja gesetzt), aber nicht zu genutztBytes (es gibt keinen used-Wert).
  it('ein limited User ohne usedBytes trägt zu summeBegrenztBytes, aber nicht zu genutztBytes bei', () => {
    const nieEingeloggt = user({ quota: parseQuota({ quota: 1073741824 }) });
    expect(storageTotals([nieEingeloggt])).toEqual({
      genutztBytes: 0, summeBegrenztBytes: 1073741824, anzahlUnbegrenzt: 0, anzahlUnbekannt: 0,
    });
  });
});

describe('istFastVoll', () => {
  it('c.voll (95 %) -> true', () => {
    expect(istFastVoll(fixture[2])).toBe(true);
  });

  it('d.halb (50 %) -> false', () => {
    expect(istFastVoll(fixture[3])).toBe(false);
  });

  it('a.unbegrenzt -> false', () => {
    expect(istFastVoll(fixture[0])).toBe(false);
  });

  it('b.unbekannt -> false', () => {
    expect(istFastVoll(fixture[1])).toBe(false);
  });

  it('Grenzwert: genau 90 % -> false', () => {
    expect(istFastVoll(user({ quota: parseQuota({ quota: 1000, used: 900 }) }))).toBe(false);
  });

  it('Grenzwert: 90,1 % -> true', () => {
    expect(istFastVoll(user({ quota: parseQuota({ quota: 10000, used: 9010 }) }))).toBe(true);
  });

  // Der nie eingeloggte User, den parseQuota tatsächlich produziert (ARCHITECTURE §4:
  // "limited ohne used -> usagePercent null") - kein konstruiertes Objekt, sondern derselbe Shape
  // wie eine echte Nextcloud-Antwort mit gesetztem quota, aber ohne used-Feld.
  it('limited ohne usedBytes/usagePercent (nie eingeloggter User) -> false', () => {
    const nieEingeloggt = user({ quota: parseQuota({ quota: 1073741824 }) });
    expect(nieEingeloggt.quota).toMatchObject({ kind: 'limited', usedBytes: null, usagePercent: null });
    expect(istFastVoll(nieEingeloggt)).toBe(false);
  });
});

describe('fastVollListe', () => {
  it('25 Treffer, max: 20 -> 20 Einträge, 5 weitere, absteigend sortiert', () => {
    const users = Array.from({ length: 25 }, (_, i) => user({
      userid: `u${i}`,
      quota: parseQuota({ quota: 1000, used: 910 + i }), // 91,0 % .. 115,4 %
    }));
    const result = fastVollListe(users, { max: 20 });
    expect(result.eintraege).toHaveLength(20);
    expect(result.weitere).toBe(5);
    expect(result.eintraege[0].quota.usagePercent).toBeGreaterThanOrEqual(
      result.eintraege[19].quota.usagePercent,
    );
  });

  // Gap-Fix (REVIEW-NOTES "S13 dashboard.test.js:84-86"): die obige Prüfung vergleicht nur
  // Index 0 gegen Index 19 - eine "erst slicen, dann sortieren"-Implementierung (nimmt die ersten
  // 20 Elemente in Ursprungsreihenfolge und sortiert NUR die) besteht das genauso, weil sie ihre
  // eigene Teilmenge intern korrekt sortiert. Die Nutzer unten stehen aufsteigend nach usagePercent
  // in der Ausgangsliste (u0 niedrigster, u24 höchster Wert) - eine falsche Implementierung würde
  // also u0..u19 behalten (die NIEDRIGSTEN 20) statt der korrekten u5..u24 (die HÖCHSTEN 20).
  it('behält die 20 höchsten Werte, verwirft die 5 niedrigsten (kein "erst slicen, dann sortieren")', () => {
    const users = Array.from({ length: 25 }, (_, i) => user({
      userid: `u${i}`,
      quota: parseQuota({ quota: 1000, used: 910 + i }), // u0 = 91,0 % .. u24 = 93,4 %, aufsteigend
    }));
    const result = fastVollListe(users, { max: 20 });

    const erwartetePercents = users
      .map((u) => u.quota.usagePercent)
      .sort((a, b) => b - a)
      .slice(0, 20);
    expect(result.eintraege.map((u) => u.quota.usagePercent)).toEqual(erwartetePercents);

    const behalteneIds = new Set(result.eintraege.map((u) => u.userid));
    for (const niedrigsteId of ['u0', 'u1', 'u2', 'u3', 'u4']) {
      expect(behalteneIds.has(niedrigsteId)).toBe(false);
    }
    for (const hoechsteId of ['u20', 'u21', 'u22', 'u23', 'u24']) {
      expect(behalteneIds.has(hoechsteId)).toBe(true);
    }
  });

  it('leere Liste -> { eintraege: [], weitere: 0 }', () => {
    expect(fastVollListe([])).toEqual({ eintraege: [], weitere: 0 });
  });

  it('weniger Treffer als max -> weitere: 0', () => {
    const users = [user({ userid: 'x', quota: parseQuota({ quota: 1000, used: 950 }) })];
    expect(fastVollListe(users, { max: 20 })).toEqual({ eintraege: users, weitere: 0 });
  });
});

describe('userCounts', () => {
  it('4 gesamt, 2 aktiv, 2 deaktiviert', () => {
    const users = [
      user({ enabled: true }), user({ enabled: true }),
      user({ enabled: false }), user({ enabled: false }),
    ];
    expect(userCounts(users)).toEqual({ gesamt: 4, aktiv: 2, deaktiviert: 2 });
  });

  it('leere Liste -> alle Nullen', () => {
    expect(userCounts([])).toEqual({ gesamt: 0, aktiv: 0, deaktiviert: 0 });
  });
});

describe('historyCounts', () => {
  it('fehler schließt teilweise ein, teilweise bleibt zusätzlich separat', () => {
    const summary = { ok: 3, fehler: 2, nichtAusgefuehrt: 1, teilweise: 4 };
    expect(historyCounts(summary)).toEqual({ ok: 3, fehler: 6, teilweise: 4 });
  });
});

// Der `limitBytes > 0`-Guard in istFastVoll/storageTotals ist über parseQuota NICHT beobachtbar
// (REVIEW-NOTES "S13 Finding 9"): classifyScalar in quota.js liefert für jeden numerischen oder
// String-Wert <= 0 immer 'unknown', nie 'limited' mit limitBytes === 0 - parseQuota kann diesen
// Zustand also gar nicht erzeugen. Analog zum Vorgehen in [S09] (Identitäts-Trenner) wird der Guard
// hier bewusst mit einer LITERALEN QuotaInfo geprüft statt einen unerreichbaren parseQuota-Weg zu
// erzwingen - kein Vakuum-Test, weil beide Assertions ohne den Guard tatsächlich rot würden.
describe('istFastVoll / storageTotals — limitBytes > 0 Guard (unbeobachtbar über parseQuota)', () => {
  const literaleQuotaInfo = { kind: 'limited', limitBytes: 0, usedBytes: 50, usagePercent: 999, roh: null };

  it('istFastVoll: limitBytes === 0 ist ausgeschlossen, trotz usagePercent > 90', () => {
    expect(istFastVoll(user({ quota: literaleQuotaInfo }))).toBe(false);
  });

  it('storageTotals: limitBytes === 0 trägt nichts zu summeBegrenztBytes bei', () => {
    expect(storageTotals([user({ quota: literaleQuotaInfo })]).summeBegrenztBytes).toBe(0);
  });
});

describe('pushJobHistorie', () => {
  it('nach sechs Jobs sind 5 Einträge vorhanden, der älteste ist weg, der neueste steht vorn', () => {
    let historie = [];
    for (let i = 1; i <= 6; i += 1) {
      historie = pushJobHistorie(historie, { zeitpunkt: i, aktion: `job${i}`, summary: null });
    }
    expect(historie).toHaveLength(5);
    expect(historie[0].aktion).toBe('job6');
    expect(historie.map((e) => e.aktion)).not.toContain('job1');
  });

  it('mutiert die Eingabeliste nicht', () => {
    const historie = [{ zeitpunkt: 1, aktion: 'alt', summary: null }];
    const copy = [...historie];
    pushJobHistorie(historie, { zeitpunkt: 2, aktion: 'neu', summary: null });
    expect(historie).toEqual(copy);
  });
});

describe('dashboard.js — rein lokal, kein Request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('das globale fetch wird von keiner Funktion aufgerufen', () => {
    const throwingFetch = vi.fn(() => {
      throw new Error('dashboard.js must never perform network I/O');
    });
    vi.stubGlobal('fetch', throwingFetch);

    storageTotals(fixture);
    fixture.forEach(istFastVoll);
    fastVollListe(fixture);
    userCounts(fixture);
    historyCounts({ ok: 1, fehler: 0, nichtAusgefuehrt: 0, teilweise: 0 });
    pushJobHistorie([], { zeitpunkt: 1, aktion: 'x', summary: null });

    expect(throwingFetch).not.toHaveBeenCalled();
  });
});

describe('dashboardCards / accentStyle (S17)', () => {
  const mk = (kind, limitBytes, usedBytes, usagePercent) => ({ enabled: true, quota: { kind, limitBytes, usedBytes, usagePercent } });
  const users = [
    mk('limited', 1000, 950, 95),
    mk('unlimited', null, 500, null),
    { enabled: false, quota: { kind: 'unknown', limitBytes: null, usedBytes: null, usagePercent: null } },
  ];

  it('liefert vier Karten mit Akzentfarben der Vorlage', () => {
    const cards = dashboardCards({ users, groupCount: 7 });
    expect(cards.map((c) => c.key)).toEqual(['benutzer', 'gruppen', 'speicher', 'fastVoll']);
    expect(cards.map((c) => c.icon)).toEqual(['bi-people-fill', 'bi-collection-fill', 'bi-hdd-fill', 'bi-exclamation-triangle-fill']);
    expect(cards.map((c) => c.iconStyle.color)).toEqual(['#58a6ff', '#a371f7', '#56d4dd', '#d29922']);
  });

  it('Werte: Benutzer, Gruppen, Fast voll; genutzt zählt unbegrenzte mit', () => {
    const [benutzer, gruppen, speicher, fastVoll] = dashboardCards({ users, groupCount: 7 });
    expect(benutzer.wert).toBe('3');
    expect(benutzer.metrics).toEqual([{ label: 'Aktiv', wert: '2' }, { label: 'Deaktiviert', wert: '1' }]);
    expect(gruppen.wert).toBe('7');
    expect(speicher.wert).toBe(formatBytes(1450));
    expect(speicher.metrics.find((m) => m.label === 'Unbegrenzte Konten').wert).toBe('1');
    expect(fastVoll.wert).toBe('1');
  });

  it('Fast voll zählt auch die über max abgeschnittenen Einträge, 90 % selbst nicht', () => {
    const viele = Array.from({ length: 25 }, () => mk('limited', 100, 95, 95));
    expect(dashboardCards({ users: viele, groupCount: 0 })[3].wert).toBe('25');
    expect(dashboardCards({ users: [mk('limited', 100, 90, 90)], groupCount: 0 })[3].wert).toBe('0');
  });

  it('accentStyle: Akzent mit .12 Alpha als Hintergrund', () => {
    expect(accentStyle('#58a6ff')).toEqual({ background: 'rgba(88, 166, 255, 0.12)', color: '#58a6ff' });
  });
});
