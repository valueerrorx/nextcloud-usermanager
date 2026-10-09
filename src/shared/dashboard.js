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
