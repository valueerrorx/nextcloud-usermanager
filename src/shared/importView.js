// Abgeleitete Werte für ImportView.vue (S10-Review, REVIEW-NOTES [S06]): kein Set/sort/filter/
// reduce/map in der .vue-Datei - jede Ableitung ist eine benannte pure Funktion mit Test.

// Input für buildImportPlans serverUserIds (der Kollisionscheck gegen bestehende Nextcloud-User).
// buildImportPlan normalisiert selbst auf lowercase, hier wird nur extrahiert.
export function serverUserIds(users) {
  return users.map((u) => u.userid);
}

// Anzahl der tatsächlich anzulegenden Zeilen (S10 spec B4) - entscheidet Button-Text und
// -Deaktivierung. Ohne Summary (noch keine Vorschau möglich) ist die Anzahl 0.
export function anzahlAnzulegen(summary) {
  return summary ? summary.neu + summary.kollisionAufgeloest : 0;
}

// Reiner Dateiname aus dem vollen Pfad, Windows- und Unix-Pfadtrenner.
export function dateiName(pfad) {
  return pfad.split(/[/\\]/).pop();
}
