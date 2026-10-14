// Suche, Filter, Sortierung und Auswahl-Schnitt für die Usertabelle (ARCHITECTURE §4.1). Pure,
// kein I/O. Einziger Ort für `quotaStufe` und `matchesSuche` - UserTable.vue/UsersView.vue rufen
// nur auf.

// Die fünf Filterstufen (DECISIONS "Quota-Filterstufen"). `limited` ohne numerischen
// usagePercent (z. B. limitBytes === 0) fällt bewusst auf 'unbekannt'. q?.kind statt q.kind,
// damit ein fehlendes/null-Quota-Objekt nicht wirft - jede andere Funktion hier ist ebenso
// defensiv.
export function quotaStufe(q) {
  if (q?.kind === 'unlimited') return 'unbegrenzt';
  if (q?.kind === 'limited' && typeof q.usagePercent === 'number') {
    if (q.usagePercent < 50) return 'unter50';
    if (q.usagePercent <= 90) return 'f50bis90';
    return 'ueber90';
  }
  return 'unbekannt';
}

// Case-insensitiver Teilstring über userid/displayname/email (DECISIONS "Suche in der
// Usertabelle"). email kann null sein (ARCHITECTURE §4) und darf nicht werfen.
export function matchesSuche(u, q) {
  const query = (q ?? '').trim().toLowerCase();
  if (query === '') return true;
  return [u.userid, u.displayname, u.email].some(
    (feld) => (feld ?? '').toLowerCase().includes(query),
  );
}

// null bei nicht vergleichbarem Kontingent (unlimited/unknown) - diese User landen immer am
// Ende, unabhängig von der Sortierrichtung.
function quotaSortWert(u) {
  return u.quota.kind === 'limited' && typeof u.quota.usagePercent === 'number'
    ? u.quota.usagePercent
    : null;
}

// Neue Liste, Eingabe bleibt unverändert. Strings über localeCompare('de') (Umlaut-Reihenfolge).
// Array.prototype.sort ist stabil (ES2019+) - Gleichstand behält die Eingabereihenfolge.
export function sortUsers(users, { feld, richtung }) {
  const vorzeichen = richtung === 'absteigend' ? -1 : 1;

  if (feld === 'quota') {
    const vergleichbar = users.filter((u) => quotaSortWert(u) !== null);
    const rest = users.filter((u) => quotaSortWert(u) === null);
    vergleichbar.sort((a, b) => vorzeichen * (quotaSortWert(a) - quotaSortWert(b)));
    return [...vergleichbar, ...rest];
  }

  if (feld === 'lastSeen') {
    const wert = (u) => (typeof u.lastSeenMs === 'number' ? u.lastSeenMs : null);
    const vergleichbar = users.filter((u) => wert(u) !== null);
    const rest = users.filter((u) => wert(u) === null);
    vergleichbar.sort((a, b) => vorzeichen * (wert(a) - wert(b)));
    return [...vergleichbar, ...rest];
  }

  return [...users].sort(
    (a, b) => vorzeichen * String(a[feld] ?? '').localeCompare(String(b[feld] ?? ''), 'de'),
  );
}

// Alle Kriterien UND-verknüpft; gibt immer eine neue Liste zurück (ARCHITECTURE §4.1).
// gruppe: null = alle, status: 'alle'|'aktiv'|'deaktiviert', quotaStufe: null = alle.
export function filterUsers(users, { suche, gruppe, status, quotaStufe: stufeFilter }) {
  return users.filter((u) => {
    if (!matchesSuche(u, suche)) return false;
    if (gruppe && !u.groups.includes(gruppe)) return false;
    if (status === 'aktiv' && !u.enabled) return false;
    if (status === 'deaktiviert' && u.enabled) return false;
    if (stufeFilter && quotaStufe(u.quota) !== stufeFilter) return false;
    return true;
  });
}

// Entfernt aus der Auswahl jede userid, die nicht (mehr) im Filterergebnis steckt - verhindert,
// dass eine Auswahl unsichtbare User mitschleppt (ARCHITECTURE §4.1). Nimmt Array oder Set,
// liefert immer ein Array.
export function pruneAuswahl(auswahl, gefilterte) {
  const sichtbar = new Set(gefilterte.map((u) => u.userid));
  return [...auswahl].filter((userid) => sichtbar.has(userid));
}

// Alphabetisch (deutsch) deduplizierte Gruppenliste aus der Userliste - benannte pure Funktion
// statt Rechnen in Vue (ARCHITECTURE §4.1). GroupsView (S12) braucht dieselbe Ableitung.
export function gruppenOptionen(users) {
  const alle = new Set();
  users.forEach((u) => (u.groups ?? []).forEach((g) => alle.add(g)));
  return [...alle].sort((a, b) => a.localeCompare(b, 'de'));
}

// Memberships of exactly these users — the remove-from-group dialog must not list every group.
export function gruppenDerUser(users, userids) {
  const ids = new Set(userids);
  return gruppenOptionen((users ?? []).filter((u) => ids.has(u.userid)));
}

// Eine Wahrheit für den Header-Checkbox-Zustand, von UserTable.vue und UsersView.vue gemeinsam
// genutzt - zwei unabhängige Kopien derselben Prüfung dürfen nicht auseinanderlaufen, weil die
// Auswahlgröße später die beim Batch-Löschen einzutippende Zahl ist. Ein leeres Filterergebnis
// zählt bewusst nicht als "alle ausgewählt" - sonst wäre der Header-Checkbox angehakt, ohne
// dass eine Zeile sichtbar ist.
export function alleAusgewaehlt(auswahl, gefilterte) {
  return gefilterte.length > 0 && gefilterte.every((u) => auswahl.has(u.userid));
}

// Page sizes for the user table. The full filtered list stays loaded; only the slice is rendered.
export const SEITEN_GROESSEN = [100, 150, 200, 400];

export function seitenAusschnitt(liste, seite, groesse) {
  const quelle = Array.isArray(liste) ? liste : [];
  const gesamt = quelle.length;
  const groesseNorm = SEITEN_GROESSEN.includes(groesse) ? groesse : SEITEN_GROESSEN[0];
  const seiten = Math.max(1, Math.ceil(gesamt / groesseNorm));
  const nummer = Number.isFinite(seite) ? Math.trunc(seite) : 1;
  const seiteNorm = Math.min(Math.max(1, nummer), seiten);
  const start = (seiteNorm - 1) * groesseNorm;
  const eintraege = quelle.slice(start, start + groesseNorm);
  return {
    eintraege,
    seite: seiteNorm,
    seiten,
    von: gesamt === 0 ? 0 : start + 1,
    bis: start + eintraege.length,
    gesamt,
  };
}
