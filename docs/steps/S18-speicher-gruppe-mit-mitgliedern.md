# S18 — Freier Speicher im Dashboard + Gruppe mit Mitgliedern löschen

Status: spec (schlanker Modus). Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §3, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md`. Fakten: Research-Bericht unten (Quellen: nextcloud/server und nextcloud/serverinfo, master).

## A. „Frei auf dem Server" (Dashboard)

Fakten:
- Das `quota`-Objekt pro User liefert **keinen** Plattenplatz. Bei unbegrenzten Usern ist `free` = -3
  (live bestätigt, RESEARCH-OCS V3). Daraus nie „frei" ableiten.
- Die serverinfo-App (Standard, abschaltbar) bietet `GET /ocs/v1.php/apps/serverinfo/api/v1/info?skipApps=true&skipUpdate=true`.
  `ocs.data.nextcloud.system.freespace` = Bytes oder `null`. Auth: Mitglied der admin-Gruppe (Basic + App-Passwort
  sollte reichen, **live unbestätigt**). Nicht berechtigt -> HTTP 401; App aus -> 404/kein OCS.
  Es gilt die bestehende Erfolgsregel (HTTP 2xx und statuscode 100).

Umsetzung:
1. Main: neue OCS-Funktion `getServerInfo(client)` in `src/main/ocs/` und ein IPC-Kanal `server.freeSpace` ->
   `{ ok: true, freeBytes: number|null }` oder `{ ok: false, messageId, message }`. Nie werfen, Preload benannt.
   Fehler werden **nicht** als Fehlerpopup gezeigt.
2. Pure Funktion in `src/shared/` macht daraus den Kachelwert: Bytes -> lesbar (bestehende Quota-Formatierung),
   `null`/Fehler -> „nicht verfügbar" mit Hinweis (z. B. „serverinfo-App nicht erreichbar"). Nur endliche Zahlen ≥ 0
   gelten als Wert.
3. Die Speicher-Kachel bekommt die Metrikzeile **„Frei auf dem Server"**. Bestehende Werte (genutzt gesamt,
   vergebene Kontingente) bleiben. Geladen wird beim Dashboard-Laden und bei „Daten aktualisieren".
4. **Ein Fehler beim Freiplatz darf das Dashboard nicht in den Fehlerzustand bringen.**

## B. Gruppe löschen, optional mit Mitgliedern (Gruppen-Ansicht)

Regel (Tech-Lead, dem Nutzer angekündigt):
- Im Löschdialog Checkbox **„Auch Mitglieder löschen, die in keiner anderen Gruppe sind"**, Standard **aus**.
  Aus = Verhalten wie bisher (Text „Die Mitglieder selbst werden nicht gelöscht").
- Gelöscht werden nur Mitglieder, deren **einzige** Gruppe diese ist. Mitglieder mit weiteren Gruppen bleiben und
  verlieren nur diese Gruppe.
- Der verbundene Admin wird nie gelöscht (bestehender Selbstschutz in `planActions`).
- Die `admin`-Gruppe bleibt unlöschbar (`istGruppeLoeschbar`).

Ablauf mit Checkbox an:
1. **Mitgliederliste frisch holen**: `GET /cloud/groups/{gid}` -> `data.users` (neuer IPC-Kanal oder Erweiterung
   eines bestehenden Kanals; nie werfen). Grund: die geladene Userliste kann veraltet sein oder User auslassen.
2. Pure Funktion `planGruppeMitMitgliedern({ gid, mitglieder, users, adminUserId })` liefert
   `{ zuLoeschen, bleiben: [{ userid, andereGruppen }], unbekannt }`. Vergleich der userid **exakt**
   (`[S08]`), Gruppenvergleich exakt. Ein Mitglied, das nicht in der geladenen Userliste ist, landet in `unbekannt`.
3. **Ist `unbekannt` nicht leer: abbrechen** mit Meldung „Benutzerliste ist nicht aktuell — bitte neu laden",
   nichts wird gelöscht.
4. Vorschau (swal2): Liste „wird gelöscht" und Liste „bleibt (andere Gruppen: …)". Hinweis, dass die Dateien der
   gelöschten Benutzer mit gelöscht werden.
5. Benutzer löschen über **die bestehende Pipeline**: `planActions` für `user.delete` mit `zuLoeschen` als Auswahl,
   Bestätigung durch Eingabe von `plan.anzahl`, `actions.run` mit `planToItems(plan)`, `JobProgress`, Ergebnis-CSV
   und Job-Historie wie gewohnt. Kein zweiter Ausführungspfad.
6. **Die Gruppe wird nur gelöscht, wenn alle Benutzer-Löschungen `ok` sind** (oder `zuLoeschen` leer ist). Sonst
   bleibt die Gruppe bestehen, und die Rückmeldung sagt das ausdrücklich („Gruppe nicht gelöscht, weil n Benutzer
   nicht gelöscht werden konnten").
7. Danach `ladeAlles()`.

## Abnahme (automatisiert)
- `planGruppeMitMitgliedern`: nur-diese-Gruppe -> zuLoeschen; weitere Gruppe -> bleiben mit Gruppennamen;
  verbundener Admin -> nie in zuLoeschen (auch bei abweichender Groß-/Kleinschreibung der adminUserId);
  Mitglied nicht in users -> unbekannt; `Aaron.w`/`aaron.w` getrennt.
- Die Entscheidung „Gruppe löschen ja/nein nach dem Job" ist eine pure Funktion mit Tests
  (alle ok, einer fehler, einer nicht ausgeführt, leer).
- Freiplatz-Formatierung: Zahl, 0, `null`, -3, NaN, Fehlerresult.
- IPC: neue Kanäle ohne Argument -> `ok:false`, Preload-Routing, nicht verbunden -> `ok:false`.
- Mutation: Admin-Ausschluss in `planGruppeMitMitgliedern` entfernen -> Test rot.

## Nicht im Umfang
- Mitglieder in anderen Gruppen löschen (auch nicht optional).
- `diskdata`-Endpunkt (mehrere Mounts, Datenverzeichnis nicht erkennbar).
