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

// S11 B1: welche Vorschauzeilen dürfen überhaupt einen actions.run-Request auslösen - nie
// Fehlerzeilen (ARCHITECTURE §6 Status-Liste). items sind reine Usernames (wie bei jeder anderen
// Action, ARCHITECTURE §5); byUserid trägt das, was pro Zeile unterschiedlich ist (Passwort,
// Anzeigename) - Zielgruppen und Kontingent sind für den ganzen Job gleich und bleiben außerhalb.
const AUSFUEHRBARE_STATUS = new Set(['neu', 'kollision_aufgeloest']);

export function buildCreateUserItems(planRows) {
  const items = [];
  const byUserid = {};
  for (const zeile of planRows) {
    if (!AUSFUEHRBARE_STATUS.has(zeile.status)) continue;
    items.push(zeile.username);
    byUserid[zeile.username] = { password: zeile.passwort, displayName: zeile.displayname };
  }
  return { items, byUserid };
}

// S11 A3 Umfang (DECISIONS "Import-Ergebnis-Export Umfang"): Pipeline-Ergebnisse PLUS die schon in
// der Vorschau abgewiesenen Fehlerzeilen, jede Eingabezeile genau einmal. Fehlerzeilen erreichen
// die Pipeline nie, also wird für sie hier die Export-Zeile direkt aus der Vorschauzeile gebaut;
// alle anderen Zeilen werden per Username im Pipeline-Ergebnis nachgeschlagen (Usernamen sind
// unter den ausführbaren Zeilen eindeutig, buildImportPlan garantiert das). Spalte 1 ist der
// ermittelte Kandidat, falls einer existiert, sonst `Zeile n` (ARCHITECTURE §5).
export function buildImportExportRows(planRows, results) {
  const resultByUserid = new Map(results.map((r) => [r.userid, r]));
  return planRows.map((zeile) => {
    if (zeile.status === 'fehler') {
      return {
        userid: zeile.username ?? `Zeile ${zeile.zeile}`,
        aktion: 'user.create',
        status: 'fehler',
        grund: zeile.fehlerId,
        httpStatus: null,
        ocsCode: null,
        passwort: null,
      };
    }
    const result = resultByUserid.get(zeile.username);
    return {
      userid: result.userid,
      aktion: result.aktion,
      status: result.status,
      grund: result.grund,
      httpStatus: result.httpStatus,
      ocsCode: result.ocsCode,
      passwort: result.status === 'ok' || result.status === 'teilweise' ? zeile.passwort : null,
    };
  });
}
