// Gruppen-Ableitungen aus der geladenen Userliste (S12 A2, ARCHITECTURE §4, DECISIONS
// "Größenordnung der Zielinstanz"). Pure, kein I/O - memberCount und Mitgliederlisten kommen NIE
// per Request, die Userliste muss vorher geladen sein (ARCHITECTURE §3.1). GroupsView.vue ruft
// nur auf, rechnet selbst nichts (REVIEW-NOTES [S06]).

const ADMIN_GROUP = 'admin';

// groupIds in Server-Reihenfolge (aus groups.list), kein eigenes Sortieren hier. Vergleich exakt,
// nicht case-insensitiv (REVIEW-NOTES [S08]): Gruppennamen sind in Nextcloud eigenständige IDs,
// ein User in 'Lehrer' zählt nicht für 'lehrer'. Gruppen ohne Mitglieder bleiben mit
// memberCount: 0 enthalten, werden nicht herausgefiltert.
export function groupViews(users, groupIds) {
  return groupIds.map((id) => ({
    id,
    memberCount: users.filter((u) => u.groups.includes(id)).length,
    istAdmin: id === ADMIN_GROUP,
  }));
}

// Mitglieder einer Gruppe, alphabetisch (deutsch) nach Anzeigename - leere Gruppe liefert [].
export function membersOf(users, groupId) {
  return users
    .filter((u) => u.groups.includes(groupId))
    .sort((a, b) => a.displayname.localeCompare(b.displayname, 'de'));
}

// Gegenstück zu membersOf fürs Auswahl-Dropdown beim Hinzufügen: nur User, die noch nicht
// Mitglied sind, gleiche Sortierung.
export function nichtMitgliederVon(users, groupId) {
  return users
    .filter((u) => !u.groups.includes(groupId))
    .sort((a, b) => a.displayname.localeCompare(b.displayname, 'de'));
}

// Schutz gegen Löschen der admin-Gruppe. Sitzt hier, nicht im Dialog - dieselbe Begründung wie
// der Selbstschutz in dryRun.js: ein Schutz, der nur am Dialog hängt, ist von jedem anderen
// Aufrufer umgehbar. Datensicherheitsgrenze, daher Mutationsbeweis im Schrittbericht.
export function istGruppeLoeschbar(groupId) {
  return groupId !== ADMIN_GROUP;
}
