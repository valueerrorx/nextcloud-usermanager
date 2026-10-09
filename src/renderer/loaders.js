// Gemeinsamer Ladepfad für users.list / groups.list (REVIEW-NOTES [S13] CRITICAL: "ladeUserliste
// existiert in vier Kopien, die vierte liess uebersprungen/mode fallen"). UsersView, GroupsView,
// ImportView und DashboardView riefen denselben Ablauf viermal eigenständig auf - diese Datei ist
// die einzige Stelle, die usersLadezustand/users/usersMode/usersUebersprungen/usersFehler/
// usersFetchedAt bzw. die Gruppen-Gegenstücke setzt. Jede View behält ihre eigene Gating-Logik
// (ob/wann nachgeladen wird, Auswahl-Reset bei Fehler usw.) - nur das Laden selbst ist hier.
// Renderer-seitiges I/O-Modul (ruft window.api auf), deshalb nicht in src/shared/.
import { MESSAGES } from '../shared/messages.js';
import {
  users, usersLadezustand, usersFehler, usersFetchedAt, usersMode, usersUebersprungen,
  groups, groupsLadezustand, groupsFehler,
} from './state.js';

// Eigenes try/catch (REVIEW-NOTES [S01] - jede Promise wird awaited oder gecatcht), damit jeder
// Aufrufer load() ohne eigenes .catch() aufrufen kann. Gibt das Result zurück, damit Aufrufer mit
// eigener Gating-Logik (z. B. Auswahl-Reset bei Fehler) darauf reagieren können.
export async function ladeUserliste() {
  usersLadezustand.value = 'laedt';
  usersFehler.value = null;
  usersUebersprungen.value = 0;
  try {
    const result = await window.api.usersList();
    if (!result.ok) {
      usersLadezustand.value = 'fehler';
      usersFehler.value = result.message ?? MESSAGES.userliste_fehlgeschlagen;
      return result;
    }
    users.value = result.users;
    usersMode.value = result.mode;
    usersFetchedAt.value = result.fetchedAt;
    usersUebersprungen.value = result.uebersprungen ?? 0;
    usersLadezustand.value = result.users.length === 0 ? 'leer' : 'bereit';
    return result;
  } catch (error) {
    usersLadezustand.value = 'fehler';
    usersFehler.value = MESSAGES.unerwarteter_serverfehler;
    console.error('Failed to load user list:', error);
    return { ok: false };
  }
}

export async function ladeGruppen() {
  groupsLadezustand.value = 'laedt';
  groupsFehler.value = null;
  try {
    const result = await window.api.groupsList();
    if (!result.ok) {
      groupsLadezustand.value = 'fehler';
      groupsFehler.value = result.message ?? MESSAGES.gruppenliste_fehlgeschlagen;
      return result;
    }
    groups.value = result.groups;
    groupsLadezustand.value = result.groups.length === 0 ? 'leer' : 'bereit';
    return result;
  } catch (error) {
    groupsLadezustand.value = 'fehler';
    groupsFehler.value = MESSAGES.unerwarteter_serverfehler;
    console.error('Failed to load group list:', error);
    return { ok: false };
  }
}
