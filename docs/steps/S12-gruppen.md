# S12 — Gruppenverwaltung

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §3, §3.1, §4, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md` (54 Einträge).

## Ziel

Gruppen anlegen, löschen, Mitglieder anzeigen, User hinzufügen und entfernen.
`listGroups` und `createGroup` existieren seit S10 — hier kommt `deleteGroup` dazu
plus die Ansicht.

## ⚠ Die Lehre aus S10 gilt hier direkt

Mitglieder und `memberCount` werden **clientseitig aus `UserView.groups` abgeleitet**, nicht per
Request (ARCHITECTURE §4, DECISIONS „Größenordnung der Zielinstanz").
**Ohne geladene Userliste zeigt jede Gruppe 0 Mitglieder** — und eine Löschbestätigung mit
„0 Mitglieder" für eine Gruppe mit 30 Schülern ist ein Datenrisiko.

Deshalb verbindlich, wie in S10 nachgerüstet:
- `GroupsView` **lädt die Userliste selbst**, wenn `state.users` leer ist (ARCHITECTURE §3.1).
- Bis sie da ist: `StateBlock`, **keine** Mitgliederzahlen, **kein** aktiver Löschbutton.
- Die Mitgliederzahl in der Löschbestätigung stammt aus derselben puren Funktion wie die
  Anzeige — **nicht** neu gerechnet.

## A1. `src/main/ocs/groups.js` erweitern
```js
deleteGroup(client, groupid)   // DELETE /cloud/groups/{encodeURIComponent(groupid)}
```
Eigene lokale Fehlercode-Map (RESEARCH-OCS §5, **Gruppe löschen**):
`101` -> `gruppe_existiert_nicht` · `102` -> `gruppe_loeschen_fehlgeschlagen`.
Keine globale Tabelle.

## A2. `src/shared/groups.js` (neu, pur)
```js
groupViews(users, groupIds) -> [{ id, memberCount, istAdmin }]
membersOf(users, groupId)   -> UserView[]
istGruppeLoeschbar(groupId) -> boolean
```
- `memberCount` zählt User, deren `groups` die Gruppe enthält. **Vergleich exakt**, nicht
  case-insensitiv — Gruppennamen sind in Nextcloud eigenständige IDs
  (REVIEW-NOTES `[S08]`: Case-Insensitivität nur dort, wo sie begründet ist).
- Gruppen **ohne** Mitglieder erscheinen mit `memberCount: 0`, werden nicht weggefiltert.
- `istAdmin` ist `true` für die Gruppe `admin`.
- `istGruppeLoeschbar('admin') === false` (DECISIONS „Gruppen: Schutz gegen Löschen der
  `admin`-Gruppe"). Der Schutz sitzt **in diesem puren Modul**, damit er nicht am Dialog hängt
  und testbar ist — dieselbe Begründung wie beim Selbstschutz in `dryRun.js`.
- `membersOf` sortiert über `localeCompare('de')`.

## A3. IPC und Preload
`groups.delete` `{ groupid }` -> `{ ok }`; ohne Verbindung -> `nicht_verbunden`.
Leerer oder nur aus Whitespace bestehender `groupid` wird **in main** abgelehnt
(wie bei `groups.create` in S10 nachgerüstet). Preload namentlich.

## B. Renderer — `GroupsView.vue`

Im Designsystem aus S09a (Karten, Tabelle, Badges, Icons).

- **Gruppenliste** mit Name, Mitgliederzahl und Aktionen.
  Die `admin`-Gruppe erhält ein Schutz-Badge und einen **deaktivierten** Löschbutton mit
  `title`-Begründung.
- **Anlegen** über Button (`bi-people`) mit swal2-Eingabe und `inputValidator`
  (nicht leer, nicht nur Whitespace). Bei `gruppe_existiert` Liste neu laden.
- **Löschen** mit swal2-Bestätigung, die **Gruppenname und Mitgliederzahl** nennt und
  ausdrücklich sagt, dass **die Mitglieder selbst nicht gelöscht werden**
  (DECISIONS „Gruppenlöschen"). Keine Zahleneingabe — das ist nur beim User-Löschen.
- **Mitglieder anzeigen:** Auswahl einer Gruppe zeigt ihre Mitglieder aus `membersOf`.
- **User hinzufügen / entfernen:** über die **bestehende** Action-Pipeline mit
  `user.addToGroup` / `user.removeFromGroup`. **Kein zweiter Ausführungspfad**,
  kein direkter OCS-Aufruf aus dem View.
- Nach jeder Änderung: Gruppenliste **und** Userliste neu laden (die Mitgliedschaften
  stecken in den Usern).
- `state.js`: `groups`, `groupsLadezustand`, `groupsFehler`, `ausgewaehlteGruppe`.

## Neue messageIds
`gruppe_loeschen_fehlgeschlagen`, `gruppe_admin_geschuetzt`, `gruppenname_leer`.

## Abnahmekriterien (automatisiert, ~20 Tests)

1. `deleteGroup`: `101` -> `gruppe_existiert_nicht`; `102` ->
   `gruppe_loeschen_fehlgeschlagen`; Erfolg -> `{ ok: true }`; ein `kind: 'auth'` behält seine
   `messageId`. `groupid` kodiert (Test mit Sonderzeichen).
2. `groupViews`: zählt korrekt über mehrere User; eine Gruppe ohne Mitglieder bleibt mit `0`
   enthalten; `istAdmin` nur für `admin`; **Vergleich exakt** — ein User in `Lehrer` zählt
   **nicht** für `lehrer`.
3. `istGruppeLoeschbar`: `'admin'` -> `false`, alles andere -> `true`.
   **Mutationsbeweis beilegen** — der Schutz ist eine Datensicherheitsgrenze.
4. `membersOf`: liefert nur die Mitglieder; Sortierung mit Umlauten (`Ärzte` vor `Bauer`);
   leere Gruppe -> `[]`.
5. `groups.delete` ohne Verbindung -> `nicht_verbunden`; leerer `groupid` wird in **main**
   abgelehnt, **ohne** Request (am Request-Zähler gemessen, nicht am Rückgabewert).
6. Die drei Kanäle sind registriert und im Preload **namentlich** vorhanden.

**Manuell** (in `docs/MANUAL-TEST.md`): Gruppe anlegen; Name doppelt; Gruppe löschen mit
korrekter Mitgliederzahl im Dialog; `admin` ist nicht löschbar; Mitglieder anzeigen;
User hinzufügen und entfernen; **direkt nach dem Verbinden auf „Gruppen" gehen** und prüfen,
dass die Mitgliederzahlen erst nach dem Laden erscheinen und nicht als 0.

## Ausdrücklich NICHT
- Kein Gruppen-Anzeigename ändern, keine Subadmins (nicht im Ziel).
- Kein Dashboard (S13).
- **Kein zweiter Ausführungspfad** für Mitgliedschaftsänderungen — `actions.run` wird benutzt.
- **Keine Berechnung in `.vue`-Dateien** (`[S06]`, fünfmal verletzt): kein `Set`, `sort`,
  `filter`, `reduce`, `map`, `localeCompare`. Alles Abgeleitete nach `src/shared/groups.js`
  **mit Test**.
- Keine neuen Abhängigkeiten.
