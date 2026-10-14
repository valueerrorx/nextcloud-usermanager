// Gruppen-Ableitungen aus der geladenen Userliste (S12 A2, ARCHITECTURE §4, DECISIONS
// "Größenordnung der Zielinstanz"). Pure, kein I/O - memberCount und Mitgliederlisten kommen NIE
// per Request, die Userliste muss vorher geladen sein (ARCHITECTURE §3.1). GroupsView.vue ruft
// nur auf, rechnet selbst nichts (REVIEW-NOTES [S06]).

const ADMIN_GROUP = 'admin';

// Details payload is { id, displayname }; a blank displayname is the gid (Nextcloud getDisplayName).
export function gruppenAusDetails(eintraege) {
  if (!Array.isArray(eintraege)) return [];
  const result = [];
  for (const eintrag of eintraege) {
    if (!eintrag || typeof eintrag !== 'object' || typeof eintrag.id !== 'string' || eintrag.id === '') continue;
    const name = typeof eintrag.displayname === 'string' ? eintrag.displayname.trim() : '';
    result.push({ id: eintrag.id, displayname: name || eintrag.id });
  }
  return result;
}

// Catalog lookup for user.groups, which stays a list of gids. Unknown id stays the id.
export function gruppenAnzeigename(katalog, id) {
  const treffer = (katalog ?? []).find((g) => g.id === id);
  const name = typeof treffer?.displayname === 'string' ? treffer.displayname.trim() : '';
  return name || id;
}

// One-line label for native selects and dry-run text, where a second line cannot be rendered.
export function gruppenKurztext(katalog, id) {
  const name = gruppenAnzeigename(katalog, id);
  return name === id ? name : `${name} (${id})`;
}

// Server order, no extra sort. Membership matches the gid exactly: 'Lehrer' does not count for 'lehrer'.
export function groupViews(users, groups) {
  return groups.map((group) => ({
    id: group.id,
    displayname: group.displayname,
    memberCount: users.filter((u) => u.groups.includes(group.id)).length,
    istAdmin: group.id === ADMIN_GROUP,
  }));
}

// Case-insensitive substring on displayname and id. status limits the protected admin group.
export function filterGroups(gruppen, { suche = '', status = 'alle' } = {}) {
  const query = String(suche ?? '').trim().toLowerCase();
  return (gruppen ?? []).filter((g) => {
    if (query !== '' && ![g.id, g.displayname].some((feld) => String(feld ?? '').toLowerCase().includes(query))) {
      return false;
    }
    if (status === 'geschuetzt' && !g.istAdmin) return false;
    if (status === 'nichtGeschuetzt' && g.istAdmin) return false;
    return true;
  });
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

// IPC structured clone rejects Vue proxies, so group ids cross the boundary as a plain array.
export function plainGroupIds(groups) {
  return Array.from(groups ?? []);
}

// Plan for deleting a group together with its members (S18). Members whose ONLY group is `gid`
// are deleted; others stay. userid and group names are compared exactly (REVIEW-NOTES [S08], [S12]);
// only the connected admin is matched case-insensitively and is never deleted. A member missing
// from the loaded user list lands in `unbekannt` (caller must abort).
export function planGruppeMitMitgliedern({ gid, mitglieder, users, adminUserId }) {
  const adminLower = adminUserId ? adminUserId.toLowerCase() : null;
  const zuLoeschen = [];
  const bleiben = [];
  const unbekannt = [];
  for (const userid of mitglieder) {
    const user = users.find((u) => u.userid === userid);
    if (!user) {
      unbekannt.push(userid);
      continue;
    }
    const andereGruppen = user.groups.filter((g) => g !== gid);
    const istAdmin = adminLower !== null && user.userid.toLowerCase() === adminLower;
    if (istAdmin || andereGruppen.length > 0) {
      bleiben.push({ userid: user.userid, andereGruppen });
    } else {
      zuLoeschen.push(user.userid);
    }
  }
  return { zuLoeschen, bleiben, unbekannt };
}

// Delete the group only if every planned user deletion finished 'ok' (S18). `erwartet` is the
// number of planned deletions; fewer/more results than planned never counts as success.
export function entscheideGruppeLoeschen({ erwartet, results }) {
  if (erwartet === 0) return { loeschen: true, nichtGeloescht: 0 };
  const liste = Array.isArray(results) ? results : [];
  const ok = liste.filter((r) => r.status === 'ok').length;
  const loeschen = liste.length === erwartet && ok === erwartet;
  return { loeschen, nichtGeloescht: loeschen ? 0 : Math.max(1, erwartet - ok) };
}

// Feedback when the group is kept because user deletions failed (S18).
export function gruppeNichtGeloeschtText(nichtGeloescht) {
  return `Gruppe nicht gelöscht, weil ${nichtGeloescht} Benutzer nicht gelöscht werden konnten`;
}
