// resetOnConnect (REVIEW-NOTES [S13] "kein Reset bei Reconnect") - users/groups/jobHistorie/
// Importvorschau/Auswahl dürfen eine vorherige Instanz nicht überleben. Reines Setzen von
// ref.value, kein I/O - deshalb hier direkt testbar ohne Electron-/window.api-Mock.
import { describe, expect, it } from 'vitest';
import {
  auswahl, ausgewaehlteGruppe, groups, groupsFehler, groupsLadezustand, importDatei,
  importFehler, importGruppen, importPlanRows, importQuota, importRows,
  importSummary, jobHistorie, resetOnConnect, users, usersFehler, usersFetchedAt,
  usersLadezustand, usersMode, usersUebersprungen,
} from '../src/renderer/state.js';

describe('resetOnConnect', () => {
  it('setzt Userliste, Gruppen, Job-Historie, Importvorschau und Auswahl auf ihre Startwerte zurück', () => {
    // Zustand einer vorherigen Verbindung simulieren.
    users.value = [{ userid: 'alt' }];
    usersMode.value = 'fallback';
    usersFetchedAt.value = 12345;
    usersLadezustand.value = 'bereit';
    usersFehler.value = 'alter Fehler';
    usersUebersprungen.value = 3;
    auswahl.value = new Set(['alt']);

    groups.value = ['alte-gruppe'];
    groupsLadezustand.value = 'bereit';
    groupsFehler.value = 'alter Gruppenfehler';
    ausgewaehlteGruppe.value = 'alte-gruppe';

    jobHistorie.value = [{ zeitpunkt: 1, aktion: 'alt', summary: null }];

    importDatei.value = { path: '/alt.csv', zeilenAnzahl: 1 };
    importRows.value = [{ zeile: 1, vorname: 'Alt', nachname: 'User', passwort: 'geheim' }];
    importPlanRows.value = [{ zeile: 1, username: 'alt.user', passwort: 'geheim' }];
    importSummary.value = { neu: 1, kollisionAufgeloest: 0, fehler: 0 };
    importGruppen.value = ['alte-gruppe'];
    importQuota.value = '5gb';
    importFehler.value = 'alter Importfehler';

    resetOnConnect();

    expect(users.value).toEqual([]);
    expect(usersMode.value).toBeNull();
    expect(usersFetchedAt.value).toBeNull();
    expect(usersLadezustand.value).toBe('laedt');
    expect(usersFehler.value).toBeNull();
    expect(usersUebersprungen.value).toBe(0);
    expect(auswahl.value).toEqual(new Set());

    expect(groups.value).toEqual([]);
    expect(groupsLadezustand.value).toBe('laedt');
    expect(groupsFehler.value).toBeNull();
    expect(ausgewaehlteGruppe.value).toBeNull();

    expect(jobHistorie.value).toEqual([]);

    expect(importDatei.value).toBeNull();
    expect(importRows.value).toEqual([]);
    expect(importPlanRows.value).toEqual([]);
    expect(importSummary.value).toBeNull();
    expect(importGruppen.value).toEqual([]);
    expect(importQuota.value).toBeNull();
    expect(importFehler.value).toBeNull();
  });
});
