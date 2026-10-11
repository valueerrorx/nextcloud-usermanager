import { formatBytes } from './quota.js';
import { freiplatzAnzeige } from './freiplatz.js';

// Abgeleitete Werte fürs Dashboard (ARCHITECTURE §4.1, DECISIONS "Berechnungen gehören nie in
// Vue-Komponenten"). Pure, kein I/O - DashboardView.vue ruft nur auf und formatiert mit
// shared/quota.js#formatBytes/formatPercent, rechnet selbst nichts.

// Vier Speicherwerte (DECISIONS "Dashboard-Kachel Speicher"): genutztBytes zählt JEDEN User mit
// gesetztem usedBytes mit, auch unlimited (RESEARCH-OCS V3: der Admin hat quota: -3 und einen
// echten used-Wert). summeBegrenztBytes ist bewusst eine zweite, eigenständige Zahl - keine
// Gesamtsumme "genutzt vs. Kontingent".
export function storageTotals(users) {
  let genutztBytes = 0;
  let summeBegrenztBytes = 0;
  let anzahlUnbegrenzt = 0;
  let anzahlUnbekannt = 0;

  for (const u of users) {
    const { kind, limitBytes, usedBytes } = u.quota;
    if (usedBytes != null) genutztBytes += usedBytes;
    if (kind === 'limited' && limitBytes > 0) summeBegrenztBytes += limitBytes;
    if (kind === 'unlimited') anzahlUnbegrenzt += 1;
    if (kind === 'unknown') anzahlUnbekannt += 1;
  }

  return { genutztBytes, summeBegrenztBytes, anzahlUnbegrenzt, anzahlUnbekannt };
}

// unlimited, unknown und limitBytes === 0 sind ausgeschlossen (ARCHITECTURE §4.1). relative aus
// der API wird nirgends gelesen - usagePercent kommt ausschließlich aus parseQuota.
export function istFastVoll(u) {
  const { kind, limitBytes, usagePercent } = u.quota;
  return kind === 'limited' && limitBytes > 0 && usagePercent > 90;
}

// Filtert mit istFastVoll, sortiert absteigend nach usagePercent, kappt bei max (DECISIONS
// "Fast voll"-Liste"). weitere zählt die Abgeschnittenen für den "und n weitere"-Text.
export function fastVollListe(users, { max = 20 } = {}) {
  const treffer = users
    .filter(istFastVoll)
    .sort((a, b) => b.quota.usagePercent - a.quota.usagePercent);
  return {
    eintraege: treffer.slice(0, max),
    weitere: Math.max(0, treffer.length - max),
  };
}

// Kennzahlen der Benutzer-Kachel.
export function userCounts(users) {
  const gesamt = users.length;
  const aktiv = users.filter((u) => u.enabled).length;
  return { gesamt, aktiv, deaktiviert: gesamt - aktiv };
}

// fehler schließt teilweise ein, teilweise bleibt zusätzlich separat sichtbar (ARCHITECTURE §5,
// DECISIONS "summary-Form des Action-Ergebnisses") - gleiche Formel wie jobReport.js#summaryAnzeige,
// nur ohne nichtAusgefuehrt (die Job-Historie-Kachel braucht das nicht).
export function historyCounts(summary) {
  return {
    ok: summary.ok,
    fehler: summary.fehler + summary.teilweise,
    teilweise: summary.teilweise,
  };
}

// Hängt einen Jobverlauf-Eintrag vorn an und kappt bei max (DECISIONS "Dashboard Batch-Job-
// Historie": nur die laufende Sitzung, letzte 5, neueste zuerst, keine Persistenz). Dry-Runs
// gehören hier nie hinein - das entscheidet der Aufrufer (ActionBar.vue startet nur bei
// tatsächlich ausgeführten Jobs, nie bei der reinen Vorschau).
export function pushJobHistorie(historie, eintrag, { max = 5 } = {}) {
  return [eintrag, ...historie].slice(0, max);
}

// Accent colours of the stat cards.
export const CARD_ACCENTS = {
  benutzer: '#58a6ff',
  gruppen: '#a371f7',
  speicher: '#56d4dd',
  kontingente: '#d29922',
};

// Icon tile style: accent text on an accent background with .12 alpha.
export function accentStyle(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { background: `rgba(${r}, ${g}, ${b}, 0.12)`, color: hex };
}

// The four stat cards: Benutzer, Gruppen, Speicher (Nutzung + Server), Kontingente (Vergabe). Values are preformatted strings; mono marks monospace metrics.
export function dashboardCards({ users, groupCount, freiplatz = null }) {
  const zaehler = userCounts(users);
  const speicher = storageTotals(users);
  const fastVoll = fastVollListe(users);
  const frei = freiplatzAnzeige(freiplatz);
  const karte = (key, icon, kicker, wert, label, metrics) => ({
    key, icon, kicker, wert, label, metrics, iconStyle: accentStyle(CARD_ACCENTS[key]),
  });
  return [
    karte('benutzer', 'bi-people-fill', 'Benutzer', String(zaehler.gesamt), 'Konten gesamt', [
      { label: 'Aktiv', wert: String(zaehler.aktiv) },
      { label: 'Deaktiviert', wert: String(zaehler.deaktiviert) },
    ]),
    karte('gruppen', 'bi-collection-fill', 'Gruppen', String(groupCount), 'Gruppen gesamt', []),
    karte('speicher', 'bi-hdd-fill', 'Speicher', formatBytes(speicher.genutztBytes), 'Genutzt (gesamt)', [
      { label: 'Genutzt gesamt', wert: formatBytes(speicher.genutztBytes), mono: true },
      { label: 'Frei auf dem Server', wert: frei.wert, hinweis: frei.hinweis, mono: frei.hinweis === null },
    ]),
    karte('kontingente', 'bi-pie-chart-fill', 'Kontingente', formatBytes(speicher.summeBegrenztBytes), 'Summe vergebener Kontingente', [
      { label: 'Unbegrenzt', wert: String(speicher.anzahlUnbegrenzt) },
      { label: 'Unbekannt', wert: String(speicher.anzahlUnbekannt) },
      { label: 'Fast voll (> 90 %)', wert: String(fastVoll.eintraege.length + fastVoll.weitere) },
    ]),
  ];
}
