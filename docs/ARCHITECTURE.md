# Architektur

Stand 2026-10-05. Bindend für Coder und Reviewer. Quellen: `CLAUDE.md`, `docs/GOAL.md`,
`docs/DECISIONS.md` (hat Vorrang bei Widersprüchen), `docs/RESEARCH-OCS.md`,
`docs/RESEARCH-UPN.md`, `docs/SPEC-CRITIQUE.md`, `docs/REVIEW-NOTES.md`.

## 1. Überblick

Drei Prozesse, kein Framework dazwischen. Der **Renderer** (Vue 3, Vite) hält die geladene
Userliste im Speicher, rechnet Vorschauen und Vorschläge mit **puren Modulen** (`src/shared/`)
und ruft über eine **namentlich aufgelistete Preload-API** den **Main-Prozess**. Nur Main spricht
HTTP (Node-`fetch`), kennt das App-Passwort und greift auf das Dateisystem zu.
Alle Mengenoperationen — auch Einzel-User-Aktionen und der CSV-Import — laufen durch *eine*
Action-Pipeline mit fester Parallelität 4. Es gibt keinen Store, keinen Router, keine
Persistenzschicht, keine Queue-Klasse, kein Event-Bus, keine State Machine.
Neue Laufzeit-Abhängigkeiten gegenüber `CLAUDE.md`: **keine**.

## 2. Verzeichnisstruktur

```
package.json                      scripts: dev, test, lint, build (Namen exakt wie CLAUDE.md)
vite.config.js                    Renderer-Build, root = src/renderer, out = dist/renderer
electron-builder.yml              Linux-Target (AppImage) für npm run build
eslint.config.js                  Flat config, ESM
vitest.config.js                  Umgebung node, Tests aus tests/

src/main/
  index.js                        app-Bootstrap, BrowserWindow (contextIsolation/sandbox an,
                                  nodeIntegration aus), single-instance, lädt ipc.js und tls.js
  ipc.js                          EINZIGER Ort mit ipcMain.handle/on; registriert die Kanäle aus §3
  session.js                      Sitzungszustand im Speicher: Credentials, userListMode-Memo,
                                  Zertifikatsausnahme, Stop-Flags je jobId. Keine Platte
  credentials.js                  safeStorage-Backendprüfung + JSON-Datei in app.getPath('userData')
  tls.js                          certificate-error-Handler, Fingerprint, Ausnahme-Freigabe
  log.js                          dbg(string) — no-op wenn app.isPackaged; nimmt nur Strings
  files.js                        dialog.showOpenDialog/showSaveDialog + Lesen/Schreiben von CSV
  ocs/client.js                   Request-Builder (Basic Auth, OCS-APIRequest, format=json),
                                  Envelope-Unwrap, Result-Typ, Retry/Backoff
  ocs/errors.js                   mapOcsError(result, endpointMap, fallbackId) — nimmt die Map mit
  ocs/connection.js               testConnection(): /cloud/users?limit=1 + Fehlerklassifikation
  ocs/users.js                    User-Endpunkte, jede Funktion mit EIGENER Fehlercode-Map
  ocs/groups.js                   Gruppen-Endpunkte, jede Funktion mit EIGENER Fehlercode-Map
  ocs/userList.js                 users/details-Probe, Session-Memo, N+1-Fallback mit Fortschritt
  actions/pipeline.js             runJob(): Pool 4, Stop-Flag, Fortschritts-Events, Ergebnisliste
  actions/operations.js           Action-ID -> OCS-Aufrufe (ein bis zwei Schritte je Item)

src/preload/
  index.js                        contextBridge.exposeInMainWorld('api', { ...explizite Methoden })

src/shared/                       PURE MODULE: kein import von node:*, electron, fetch, fs
  username.js                     normalizeComponent, buildUsername, normalizeOrder (1:1-Port)
  usernameRules.js                Zeichensatz, reservierte Namen, Länge 64, Nachnamen-Kürzung
  birthdate.js                    parseBirthdate -> ddmmyyyy, Kalenderprüfung, Zukunftsprüfung
  password.js                     validatePrefix, buildInitialPassword, checkMinLength
  csvImport.js                    Import-CSV (Vorname;Nachname;Geburtsdatum) -> Zeilen + Fehler
  csvUserList.js                  Username-Liste (ein Name je Zeile, optionaler Header) -> IDs
  importPlan.js                   Stufen 10-16 aus §6: Zeilen -> Vorschauzeilen mit Status
  quota.js                        defensiver Quota-Reader + Presets + formatQuotaForApi
  pool.js                         runPool(items, worker, { concurrency, shouldStop })
  dryRun.js                       planActions(): Änderungen / keine Änderung / ausgeschlossen
  resultCsv.js                    Ergebniszeilen -> CSV-Text (fixe Spalten aus §5)
  userView.js                     Normalisierung Roh-OCS-User -> Renderer-Shape (§4)
  filters.js                      Suche, Filter, Sortierung (localeCompare 'de'), fastVoll-Liste
  url.js                          normalizeBaseUrl: https erzwingen, Pfad säubern
  messages.js                     messageId -> deutscher Text (einzige UI-Textquelle)

src/renderer/
  index.html                      Einstiegspunkt Vite
  main.js                         createApp, importiert theme.css und SweetAlert2
  App.vue                         dunkle Shell, Sidebar, Zertifikats-Banner, aktive View
  state.js                        reaktive refs: connection, users, groups, jobs(5), ladezustände
  styles/theme.css                Dark-Theme-Tokens, kein Light-Pfad
  views/ConnectView.vue           Server-URL, Admin, App-Passwort, Verbindung testen
  views/DashboardView.vue         vier Speicherwerte, Userzahlen, fast-voll-Liste, Jobverlauf
  views/UsersView.vue             Tabelle, Suche/Filter/Sortierung, Mehrfachauswahl, Aktionsleiste
  views/GroupsView.vue            Gruppen anlegen/löschen, Mitglieder, User zu/ab
  views/ImportView.vue            CSV wählen, Optionen, Vorschautabelle, Anlegen, Export
  components/UserTable.vue        Tabelle inkl. "alle auswählen" = aktuelles Filterergebnis
  components/ActionBar.vue        Aktionsauswahl, Dry-Run-Aufruf, Bestätigungen (swal2)
  components/JobProgress.vue      Fortschritt, Abbrechen, Ergebnisbericht, CSV-Export
  components/StateBlock.vue       Loading / Empty / Error für Tabelle, Gruppen, Dashboard
  components/QuotaCell.vue        Anzeige aus quota.js-Output, nie aus Rohdaten

tests/
  username.test.js                alle 14 Zeilen RESEARCH-UPN §11 + 5 Fixtures §10
  usernameRules.test.js           Zeichensatz, reservierte Namen, Kürzungsalgorithmus
  birthdate.test.js               beide Formate, 31.02.2010, Zukunft, Müll
  password.test.js                Prefix-Validierung, Passwortbildung, Mindestlänge
  csvImport.test.js               je ein Fall pro Datei-/Zeilenfehler aus §6
  csvUserList.test.js             mit/ohne Header, Leerzeilen, Duplikate
  importPlan.test.js              Kollision, Kürzung-vor-Kollision, Re-Import, Status-Matrix
  quota.test.js                   alle sechs Shapes aus RESEARCH-OCS §4
  pool.test.js                    Parallelität 4, Stop-Flag, jedes Item genau einmal
  dryRun.test.js                  No-Ops, Selbstschutz, Ausschlüsse, Zählwerk
  resultCsv.test.js               Spalten, Trennzeichen, Maskierung, Passwortspalte
  filters.test.js                 Suche, Sortierung mit Umlauten, fastVoll-Prädikat
  url.test.js                      Trailing Slash, /index.php, http abgelehnt
  ocsClient.test.js               gemockte fetch: 100/401/403/429/HTML/Netzfehler, Header-Pflicht
  ocsUsers.test.js                endpunktspezifische Codes -> messageId
  ocsGroups.test.js               102/103/101 je Endpunkt
  userList.test.js                details-Probe, Fallback-Trigger, Session-Memo
  pipeline.test.js                50 Items, 7 Fehler, ein 429, Abbruch bei 20
  fixtures/                       siehe §9
```

## 3. IPC-Vertrag (vollständig und abschließend)

Preload exponiert genau diese Methoden. **Kein generisches `invoke(channel, ...)`.**
Alle `invoke`-Kanäle werfen nie; sie liefern `Result = { ok: true, ...}` oder
`{ ok: false, messageId, message, httpStatus?, ocsCode? }`.
**Das App-Passwort ist in keinem Rückgabewert, keinem Event und keiner Meldung enthalten —
auch nicht maskiert.** Es fließt ausschließlich Renderer -> Main, nie zurück.

| Methode | Richtung | Argument | Rückgabe | Fehlerfälle |
|---|---|---|---|---|
| `connection.test` | invoke | `{ baseUrl, adminUser, appPassword }` | `{ ok, adminUserId, isAdmin }` | URL ungültig, 401, 403/997, 429, HTML-Antwort, Netz, Zertifikat |
| `connection.connect` | invoke | `{ baseUrl, adminUser, appPassword, remember }` | `{ ok, status }` | wie oben + `secret_nicht_gespeichert` |
| `connection.connectSaved` | invoke | – | `{ ok, status }` | `kein_gespeicherter_zugang`, 401 -> `gespeichertes_passwort_abgelehnt` |
| `connection.status` | invoke | – | `{ connected, baseUrl, adminUserId, secretStorage, certException }` | – |
| `connection.savedHint` | invoke | – | `{ hasSaved, baseUrl, adminUser }` | – |
| `connection.forgetSaved` | invoke | – | `{ ok }` | Schreibfehler |
| `connection.disconnect` | invoke | – | `{ ok }` | – |
| `users.list` | invoke | `{ refresh }` | `{ ok, users: UserView[], mode, fetchedAt }` | 401, 429, Netz, `details_und_fallback_fehlgeschlagen` |
| `users.onLoadProgress` | main->renderer | – | `{ done, total }` | – (nur im N+1-Fallback) |
| `groups.list` | invoke | – | `{ ok, groups: GroupView[] }` | 401, 429, Netz |
| `groups.members` | invoke | `{ groupId }` | `{ ok, members: string[] }` | `gruppe_nicht_gefunden`, `antwort_shape_unbekannt` |
| `groups.create` | invoke | `{ groupId }` | `{ ok }` | 101/102/103 je Endpunkt-Map |
| `groups.delete` | invoke | `{ groupId }` | `{ ok }` | 101/102, `admin_gruppe_geschuetzt` |
| `actions.run` | invoke | `{ jobId, action, items, params }` | `{ ok, results: ItemResult[], summary }` | nie global fehlerhaft; Fehler stehen je Item |
| `actions.stop` | invoke | `{ jobId }` | `{ ok }` | unbekannte jobId |
| `actions.onProgress` | main->renderer | – | `{ jobId, done, total, result }` | – |
| `tls.onCertificatePrompt` | main->renderer | – | `{ requestId, host, fingerprint, subject, issuer, validTo }` | – |
| `tls.respondCertificate` | invoke | `{ requestId, akzeptiert }` | `{ ok }` | abgelaufene requestId |
| `files.openCsv` | invoke | `{ zweck: 'import' \| 'userliste' }` | `{ ok, path, text }` | `abgebrochen`, `datei_zu_gross` (>5 MB), Lesefehler |
| `files.saveCsv` | invoke | `{ vorschlag, inhalt }` | `{ ok, path }` | `abgebrochen`, Schreibfehler |

Nicht vorhanden und auch nicht nachzurüsten: Kanäle für Joblisten-Persistenz, Einzel-User-Kanäle
(laufen über `actions.run`), Shell-/Pfad-Zugriffe, `openPath`.
Der Jobverlauf (letzte 5, DECISIONS 33) liegt in `renderer/state.js` im Speicher — kein Kanal nötig.

## 4. Datenmodell

`UserView` (einzige Form, die der Renderer sieht; erzeugt von `shared/userView.js`):

```js
{ userid, displayname, email: string|null, enabled: boolean,
  groups: string[], quota: QuotaInfo, istVerbundenerAdmin: boolean }
```

`GroupView`: `{ id, memberCount }` — `memberCount` wird clientseitig aus `UserView.groups`
gezählt, nicht per Request (DECISIONS 34: Liste ist ohnehin komplett geladen).

`QuotaInfo` (Output von `shared/quota.js`, der **einzige** erlaubte Quota-Zugang für
Dashboard, Tabelle, Filter und Dry-Run):

```js
{ kind: 'limited' | 'unlimited' | 'unknown',
  limitBytes: number|null, usedBytes: number|null, usagePercent: number|null, roh: unknown }
```

Abbildung aller belegten Shapes:

| Eingang | kind | limitBytes | usedBytes |
|---|---|---|---|
| `{ quota: -3, used: 12 }` oder `"none"` oder `-3` | `unlimited` | `null` | 12 bzw. `null` |
| `{ free, used, total, relative, quota: 1073741824 }` | `limited` | 1073741824 | `used` |
| Skalar `0` / `"0"` | `unknown` | `null` | `null` |
| `null` / Feld abwesend / `{ total: null }` | `unknown` | `null` | `null` |
| `"1 GB"` / `"100MB"` / numerischer String | `limited` | geparste Bytes | wie geliefert |
| negative Werte ≠ -3 | `unknown` | `null` | `null` |

`usagePercent` nur wenn `kind === 'limited' && limitBytes > 0 && usedBytes != null`.
Skalar `0` ist bewusst `unknown`, nicht `limited: 0`: Nextcloud liefert 0 auch für
"kein Kontingent gesetzt", eine Prozentrechnung wäre undefiniert. Dadurch fällt der Fall
automatisch aus der >90-%-Liste und aus der Summe der begrenzten Kontingente heraus.

## 5. Action-Pipeline

Ein Pfad für alles (DECISIONS 51). `actions.run` bekommt eine Liste von Items; eine
Einzelaktion ist eine Liste der Länge 1, der Import eine Liste von Vorschauzeilen.

Action-IDs: `user.enable`, `user.disable`, `user.delete`, `user.setQuota`, `user.update`
(displayname/email, Einzelansicht), `user.setPassword`, `user.addToGroup`,
`user.removeFromGroup`, `user.create`.

`operations.js` liefert pro Action `{ label, steps(item, params) -> Step[] }`.
Fast alle Actions haben **einen** Schritt. Einzige Ausnahme: `user.create` =
`POST /cloud/users` (userid, password, displayName, quota) und danach je Zielgruppe
`POST /cloud/users/{id}/groups`. *Begründung:* das Verhalten von `groups[]` im Create-Call bei
Gruppenfehlern ist unverifiziert; getrennte Schritte machen einen Teilfehler benennbar statt
den Gesamtzustand unklar zu lassen.

Ablauf in `pipeline.js`:
1. Items in `shared/pool.js` mit `concurrency: 4` (DECISIONS 41, Konstante `CONCURRENCY = 4`).
2. Vor jedem Dispatch `session.shouldStop(jobId)` prüfen. Gesetzt -> restliche Items ohne
   Request als `nicht ausgeführt` verbuchen. **Gewählt: Stop-Dispatch-Flag, kein AbortController** —
   DECISIONS 42 verlangt ausdrücklich, dass laufende Requests fertiglaufen; ein Signal würde sie abbrechen.
3. Pro Schritt Retry-Politik aus `ocs/client.js`: HTTP 429 -> bis zu 2 Wiederholungen mit 2 s / 6 s;
   Netzfehler und 5xx -> genau eine Wiederholung. Ein 429 wird erst nach erschöpften Retries ein
   Fehler. **Kein Pausendialog** (DECISIONS: gestrichen) — erschöpfte Retries sind ein normaler
   Item-Fehler mit eigener Begründung `server_blockt_vorerst`, der Job läuft weiter.
4. Nach jedem Item `actions.onProgress`. Jedes Item erscheint **genau einmal** im Ergebnis.

`ItemResult`:

```js
{ userid, aktion, status: 'ok'|'fehler'|'nicht ausgeführt'|'teilweise',
  grund: string, httpStatus: number|null, ocsCode: number|null,
  schritte?: [{ name, status, grund }] }
```

`teilweise` nur wenn mindestens ein Schritt `ok` und mindestens einer `fehler` ist
(praktisch: User angelegt, Gruppenzuweisung fehlgeschlagen). Kein Rollback, keine Kompensation.

**Dry-Run** (`shared/dryRun.js`, pur, kein Re-Fetch — rechnet nur auf der geladenen Liste):
`planActions(action, auswahl, params, { adminUserId })` ->
`{ aenderungen: [...], keineAenderung: [...], ausgeschlossen: [{ userid, grund }] }`.
- `keineAenderung`: schon aktiv/deaktiviert, schon in Gruppe, nicht in Gruppe, Kontingent identisch.
- `ausgeschlossen`: `nicht gefunden` (nur bei Username-CSV-Auswahl, DECISIONS 37) und
  `eigener Admin-Zugang` bei `user.delete`/`user.disable` (DECISIONS 43, Selbstschutz).
  Der Selbstschutz sitzt **in diesem puren Modul**, damit Einzel- und Batchweg ihn gemeinsam
  erben und er testbar ist.
- "Alles auswählen" liefert immer nur das aktuelle Filterergebnis.

**Bestätigungen** (swal2): jede Aktion zeigt den Dry-Run. Bei `user.delete` zusätzlich Eingabe der
Dezimalzahl aus `aenderungen.length` (DECISIONS 44): getrimmter exakter Stringvergleich,
Button bis zur Übereinstimmung deaktiviert, kein Versuchslimit, auch bei n = 1.
Einzellöschung läuft über denselben Dialog, zeigt zusätzlich die `userid`.

**Ergebnis-CSV** (`shared/resultCsv.js`): UTF-8 mit BOM, Trennzeichen `;`, CRLF, Spalten
`userid;aktion;status;grund;httpStatus;ocsCode` (DECISIONS 48) — identisch für Batch-Bericht und
Import-Export, Fehler- und `nicht ausgeführt`-Zeilen enthalten. Der Import-Export hängt eine
**siebte** Spalte `passwort` an, nur gefüllt bei `ok`/`teilweise`; DECISIONS 10 fordert den Export
von Username + Initialpasswort, die ersten sechs Spalten bleiben wie entschieden.
Export auch nach Abbruch. Vor dem Speichern des Passwort-Exports swal2-Warnung, nur
nutzergewählter Pfad, kein Default im App-Verzeichnis, kein Auto-Open (DECISIONS 49).

## 6. Username-Generierung und Import-Pipeline

Reihenfolge der Stufen, von CSV-Bytes zur Vorschauzeile. Stufen 1-9 in `shared/csvImport.js`,
10-16 in `shared/importPlan.js`. Beide ohne I/O; die Bytes kommen aus `files.openCsv`.

1. UTF-8 dekodieren, BOM entfernen (Excel erzeugt eine).
2. CRLF und CR auf LF normalisieren, abschließende Leerzeilen verwerfen.
3. Trennzeichenerkennung an der Headerzeile: häufigeres von `;` und `,` gewinnt;
   **bei Gleichstand `;`** (deutsches Excel); kommt keines vor -> Dateifehler `header_fehlt`.
4. Header prüfen: genau `Vorname`, `Nachname`, `Geburtsdatum`, getrimmt, case-insensitiv.
5. Zeilenobergrenze 2000 (DECISIONS 46) -> sonst Dateifehler `zeilenlimit`.
6. Je Zeile splitten. **Kein RFC4180-Quoting** (DECISIONS 45): enthält ein Feld ein `"` in
   unbalancierter Zahl -> Zeilenfehler `quote_unbalanciert`. Falsche Spaltenzahl -> `spaltenzahl`.
7. Felder trimmen; leerer Vor- oder Nachname -> `vorname_leer` / `nachname_leer`.
8. Geburtsdatum: `dd.mm.yyyy` oder `yyyy-mm-dd` (DECISIONS 14), intern immer `ddmmyyyy`
   (DECISIONS 40). Nicht parsbar -> `datum_format`; kalendarisch ungültig (31.02.2010) ->
   `datum_ungueltig`; in der Zukunft -> `datum_zukunft`.
9. Dublette innerhalb der Datei (Vorname+Nachname+ddmmyyyy, normalisiert) -> `doppelzeile`.
10. `normalizeComponent` auf Vor- und Nachname (Regex-Kette exakt in der Reihenfolge
    RESEARCH-UPN §1, Schritte 1-8, 1:1 portiert). Ist eine Komponente `''` ->
    `name_nicht_abbildbar`.
11. `buildUsername(vn, nn, order)` mit `.` als Trenner; `order` aus dem Import-Dialog
    (`givenFirst` Default, `surnameFirst`), unbekannte Werte fallen auf `givenFirst` zurück.
12. Zeichensatzprüfung gegen `[a-z0-9.]` (Generatorausgabe ist per Konstruktion konform) und
    gegen reservierte Namen aus RESEARCH-OCS §7 -> `username_reserviert`, `username_zeichen`.
13. **Längenregel (vor der Kollisionsprüfung):** ist der Name länger als `MAX_USERID = 64`,
    wird die **Nachnamen-Komponente** zeichenweise von rechts gekürzt, bis er passt
    (DECISIONS 27). Erfolgt eine Kürzung, Flag `gekuerzt`. Passt es auch bei einem
    Restzeichen des Nachnamens nicht -> `username_zu_lang`.
14. **Eindeutigkeit** case-insensitiv (DECISIONS 19) gegen bestehende Nextcloud-User
    *und* die bereits in diesem Lauf vergebenen Namen:
    - frei -> Status `neu`.
    - belegt -> `.ddmmyyyy` an die **gewählte** Reihenfolge anhängen (DECISIONS 39), dann
      **Stufe 13 erneut** anwenden (Nachnamen weiter kürzen, Suffix bleibt unangetastet) und
      **danach Eindeutigkeit erneut prüfen**:
      - frei -> Status `kollision_aufgeloest`.
      - noch belegt (gleicher Name *und* gleiches Geburtsdatum) -> Zeilenfehler
        `benutzer_existiert_bereits`, kein Zählersuffix (DECISIONS 26).
15. `displayname = "${Vorname} ${Nachname}"` in Originalschreibweise (DECISIONS 16).
    `email` bleibt leer (DECISIONS 11).
16. Initialpasswort `` `${prefix}${ddmmyyyy}!` `` (DECISIONS 9/28/29). Prefix: Pflicht,
    3-20 Zeichen, `[A-Za-z0-9]`, erster Buchstabe groß (DECISIONS 30); Ergebnis lokal auf
    ≥ 10 Zeichen prüfen. Der vergebene Username wird in das Set der Stufe 14 eingetragen.

Vorschauzeilen-Status (fixe Liste): `neu`, `kollision_aufgeloest`, `fehler`.
Zusatz-Flag: `gekuerzt` (kombinierbar mit `neu` und `kollision_aufgeloest`).

Zeilen- und Dateifehler, abschließende Enumeration mit UI-Text aus `shared/messages.js`:

| id | deutsche Meldung |
|---|---|
| `datei_leer` | Die Datei ist leer. |
| `nur_header` | Die Datei enthält nur die Kopfzeile. |
| `header_fehlt` | Kopfzeile fehlt oder Spalten heißen nicht Vorname, Nachname, Geburtsdatum. |
| `zeilenlimit` | Mehr als 2000 Zeilen. Bitte die Datei aufteilen. |
| `spaltenzahl` | Zeile hat nicht genau 3 Spalten. |
| `quote_unbalanciert` | Unvollständiges Anführungszeichen. Anführungszeichen werden nicht unterstützt. |
| `vorname_leer` | Vorname fehlt. |
| `nachname_leer` | Nachname fehlt. |
| `name_nicht_abbildbar` | Aus diesem Namen lässt sich kein Username bilden. |
| `datum_format` | Geburtsdatum muss dd.mm.yyyy oder yyyy-mm-dd sein. |
| `datum_ungueltig` | Dieses Datum existiert nicht. |
| `datum_zukunft` | Geburtsdatum liegt in der Zukunft. |
| `doppelzeile` | Identische Zeile kommt in der Datei mehrfach vor. |
| `username_zu_lang` | Username ist auch nach Kürzen des Nachnamens zu lang. |
| `username_reserviert` | Dieser Username ist in Nextcloud reserviert. |
| `username_zeichen` | Username enthält unerlaubte Zeichen. |
| `benutzer_existiert_bereits` | Benutzer existiert bereits (gleicher Name und gleiches Geburtsdatum). |

Zielgruppen im Import-Dialog: nur vom Server gelesene Gruppen, plus ausdrückliche Aktion
"Gruppe neu anlegen" vor dem Lauf (DECISIONS 47), damit OCS `104` nicht mitten im Import auftritt.
Das Geburtsdatum erscheint in der Vorschau und im Export, sonst nirgends; es wird nicht geloggt.
Die Passwortliste wird beim Verlassen der Importansicht aus `state.js` entfernt.

## 7. OCS-Client

`request({ method, path, query, form })` in `ocs/client.js`:
- Basis `${baseUrl}/ocs/v1.php` + `path`; `format=json` immer in der Query.
- Header auf **jedem** Request: `OCS-APIRequest: true`, `Accept: application/json`,
  `Authorization: Basic base64(user:appPassword)`. Credentials kommen aus `session.js` und
  werden nie in ein Result, ein Log oder eine Exception geschrieben.
- Body als `application/x-www-form-urlencoded`; Arrays als `groups[]`.
- Timeout 20 s über `AbortSignal.timeout` (betrifft nur den einzelnen Request, nicht den Job).
- Envelope-Unwrap: `json.ocs.meta.statuscode` und `json.ocs.data`. Erfolg nur wenn
  HTTP 2xx **und** `statuscode === 100` (REVIEW-NOTES 2).

Result-Typ überall identisch:

```js
{ ok: true, data, httpStatus }
{ ok: false, kind: 'ocs'|'http'|'auth'|'forbidden'|'ratelimit'|'notOcs'|'network'|'timeout'|'cert',
  httpStatus: number|null, ocsCode: number|null, messageId, message }
```

`kind: 'notOcs'` wenn die Antwort kein JSON mit `ocs`-Wurzel ist (typisch HTML bei falschem
Basis-Pfad oder fehlendem Header).

**Fehlercode-Maps pro Endpunkt**, keine globale Tabelle (REVIEW-NOTES 3): jede Funktion in
`ocs/users.js` und `ocs/groups.js` definiert ihre eigene lokale Map und übergibt sie an
`mapOcsError(result, MAP, fallbackId)`. Beispiel:

```js
const CREATE_USER_ERRORS = { 101: 'ungueltiges_argument', 102: 'user_existiert',
  104: 'gruppe_existiert_nicht', 105: 'keine_rechte_fuer_gruppe', 107: 'passwort_policy',
  111: 'userid_nicht_erzeugbar' };
```

`mapOcsError` kennt nur `kind`-basierte Fallbacks (`auth`, `forbidden`, `ratelimit`, `notOcs`,
`network`), nie endpunktspezifische Codes.

**`users/details`-Probe und N+1-Fallback** (`ocs/userList.js`):
1. Erster Aufruf `GET /cloud/users/details?format=json`.
2. **Fallback-Trigger** (genau diese Bedingungen): HTTP 404 · `kind: 'notOcs'` ·
   `statuscode !== 100` · `data.users` fehlt oder ist kein Objekt · der erste Eintrag hat weder
   `enabled` noch `quota`.
3. Fallback: `GET /cloud/users` (IDs) + je ID `GET /cloud/users/{id}` über denselben Pool
   (concurrency 4), mit `users.onLoadProgress` und sichtbarer Warnung im UI
   ("Einzelabfragen, kann dauern", DECISIONS 34).
4. Das Ergebnis der Probe wird **für die Sitzung memoisiert** (`session.userListMode`
   = `'details' | 'fallback'`) und erst bei Reconnect neu bestimmt.
Beide Wege laufen durch `shared/userView.js` und liefern identische `UserView`-Objekte.

**Gruppenmitglieder** defensiv parsen: `{ users: [...] }` und ein nacktes Array akzeptieren,
sonst `antwort_shape_unbekannt` mit Endpunktnamen in der Meldung.

**Verbindungstest** (`ocs/connection.js`): `GET /cloud/users?limit=1&format=json`.
Erfolg = HTTP 200 **und** `statuscode === 100`. Klassifikation mit eigenen Meldungen:
401 -> `falsche_zugangsdaten`; 403 oder OCS 997 -> `kein_admin`; 429 ->
`server_blockt_vorerst` ("Server blockt vorübergehend, bitte warten" — nie als
"nicht erreichbar" oder "falsches Passwort"); `notOcs` -> `falscher_basispfad`;
`ENOTFOUND`/`ECONNREFUSED` -> `server_nicht_erreichbar`; Zertifikatsfehler -> Prompt aus §8.
`shared/url.js` normalisiert vorher: Schema erforderlich, **nur https** (DECISIONS 35),
Trailing Slash und angehängte `/index.php` bzw. `/ocs/...`-Reste entfernen.

**Startverhalten:** kein Auto-Connect. Beim Start zeigt `ConnectView` die gespeicherte URL und
den Admin-Namen vorbefüllt (nie das Passwort) mit Button "Mit gespeichertem Zugang verbinden".
Wird das gespeicherte Passwort abgelehnt, bleibt der Dialog offen, Passwortfeld leer, Meldung
`gespeichertes_passwort_abgelehnt`, gespeicherter Satz bleibt bis zu "Zugang löschen" erhalten.
Dashboard, Benutzer, Gruppen und Import sind erst nach erfolgreichem Verbinden erreichbar.

## 8. Zugangsdaten und TLS

`credentials.js`:
- Speichern nur auf ausdrücklichen Wunsch (`remember: true`).
- Vorher `safeStorage.isEncryptionAvailable()` und auf Linux `getSelectedStorageBackend()`.
- Backend `gnome_libsecret` / `kwallet*` -> `encryptString`, Ablage als eine JSON-Datei
  `credentials.json` in `app.getPath('userData')`: `{ baseUrl, adminUser, secret: <base64> }`.
  Kein electron-store, keine Profilliste (GOAL Zeile 8).
- Backend `basic_text` oder `isEncryptionAvailable() === false` -> **nicht persistieren**
  (DECISIONS 31). `connection.connect` liefert `{ ok: true, status: { secretStorage: 'session' } }`
  plus `messageId: 'kein_keyring_nur_sitzung'`; der Renderer zeigt eine swal2-Warnung und
  ein dauerhaftes Hinweisfeld "Zugang gilt nur für diese Sitzung".
  `setUsePlainTextEncryption()` wird nie aufgerufen.
- Entschlüsseln passiert nur in `connection.connectSaved`; das Klartextpasswort lebt
  ausschließlich in `session.js`.

`tls.js`:
- `app.on('certificate-error')`: Hostvergleich gegen `session.certException`.
  Treffer (Host + SHA-256-Fingerprint gleich) -> `callback(true)`.
- Kein Treffer -> `tls.onCertificatePrompt` mit Host, Fingerprint (Doppelpunkt-Gruppen),
  Subject, Issuer, Gültigkeit. Der Renderer zeigt einen swal2-Dialog mit dem Fingerprint
  zum Vergleich; erst `tls.respondCertificate({ akzeptiert: true })` setzt
  `session.certException = { host, fingerprint }` und ruft `callback(true)`. Ablehnen -> `callback(false)`.
- Solange eine Ausnahme aktiv ist, zeigt `App.vue` ein **permanentes Banner**
  "Unsichere Zertifikatsausnahme aktiv für `<host>` (`<fingerprint>`)".
- **Entscheidung (nicht in den Dokumenten geklärt): die Ausnahme gilt nur für die Sitzung** und
  wird nicht persistiert — eine auf Platte liegende Ausnahme wäre ein stiller Dauer-Bypass;
  die erneute Bestätigung kostet einen Klick pro Start. Punkt für den Nutzer in §11.
- `setUsePlainTextEncryption`, `ignore-certificate-errors`, `webSecurity: false` und
  `NODE_TLS_REJECT_UNAUTHORIZED` sind verboten.

## 9. Sicherheitsgrenzen

- **Main -> Renderer:** niemals das App-Passwort, auch nicht maskiert, auch nicht in
  `message`/`stack`. Kein Rohobjekt eines `fetch`-Requests, keine `Authorization`-Header.
- **Renderer:** kein Node, kein `fs`, kein `fetch` auf den Nextcloud-Host, kein `require`.
  `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`,
  `preload` die einzige Brücke. `setWindowOpenHandler` verweigert alles,
  `will-navigate` blockt externe Navigation.
- **Preload:** nur die Methoden aus §3, jede mit festem Kanalnamen. Keine
  Channel-Parameter von außen, keine Weitergabe von `ipcRenderer`.
- **Platte:** `credentials.json` (verschlüsselt) ist die einzige von der App geschriebene Datei
  ohne Nutzerdialog. CSV-Exporte nur über `dialog.showSaveDialog` an nutzergewählte Pfade.
- **Initialpasswörter:** entstehen pur im Renderer, gehen als Request-Payload nach Main und
  stehen nur im Import-Export. Nicht in Logs, nicht in `ItemResult.grund`, nicht im Jobverlauf.
- **Jobverlauf:** nur Typ, Zeit, Anzahl ok/Fehler (DECISIONS 33) — keine Usernamen-Listen,
  keine Passwörter, keine Persistenz.

## 10. Fehlerbehandlung und Logging

- `ocs/client.js` wirft nicht; alles wird Result. Netzwerk- und Parse-Fehler werden dort
  in `kind` übersetzt.
- Jeder IPC-Handler hat ein `try/catch` als letzte Rettung und liefert
  `{ ok: false, messageId: 'unerwarteter_fehler', message }` ohne Stack an den Renderer.
- Deutsche Texte ausschließlich in `shared/messages.js` (`messageId -> Text`), damit UI-Sprache
  und Codebezeichner getrennt bleiben. Der Renderer zeigt `message`, loggt nichts.
- Einzelfehler brechen einen Job nie ab (GOAL Zeile 62). Der Job endet nur durch Abbruch,
  Abbruch durch den Nutzer oder vollständige Abarbeitung.
- Jede Liste hat drei definierte Zustände über `StateBlock.vue`: Laden, Leer
  ("Keine Einträge"), Fehler mit Wiederholen-Button. Nullwerte rendern als "0".
  Datenstand mit Zeitstempel, Aktualisieren nur per Button, kein Polling.
- **Logging:** kein Datei-Logging (DECISIONS 50). `main/log.js#dbg()` ist no-op wenn
  `app.isPackaged`, nimmt nur Strings und wird nie mit Credentials, Passwörtern oder
  Exportinhalten aufgerufen. `process.on('unhandledRejection')` schreibt eine Kurzmeldung
  über `dbg`.

## 11. Teststrategie

**Pur unit-getestet, ohne Mocks** (alles in `src/shared/`): `username`, `usernameRules`,
`birthdate`, `password`, `csvImport`, `csvUserList`, `importPlan`, `quota`, `pool`, `dryRun`,
`resultCsv`, `filters`, `url`, `userView`, `messages`. Diese Module importieren nichts mit I/O —
das ist eine Review-Regel, nicht nur eine Konvention.

Pflichtfälle: alle 14 Zeilen aus RESEARCH-UPN §11 inklusive der beiden `''`-Fehlerfälle und die
5 Fixtures aus §10 (ohne Domain); beide Reihenfolgen; alle sechs Quota-Shapes; jeder Zeilen- und
Dateifehler aus §6; Kürzung-vor-Kollision und Kollision-nach-Kürzung; Re-Import derselben CSV
ergibt ausschließlich `benutzer_existiert_bereits`.

**Mit gemocktem `fetch`** (`globalThis.fetch` per `vi.stubGlobal`, keine HTTP-Bibliothek):
`ocs/client.js` (Header-Pflicht `OCS-APIRequest`, `format=json`, 100/401/403/429/HTML/Netzfehler,
Retry-Zählung), `ocs/users.js` und `ocs/groups.js` (endpunktspezifische Codes -> messageId),
`ocs/userList.js` (Probe-Erfolg, 404-Fallback, Shape-Fallback, Session-Memo),
`actions/pipeline.js` (50 Items, 7 Fehler, ein 429 mit Retry, Abbruch bei Item 20 -> jedes Item
genau einmal, 429 nicht als Userfehler, `teilweise` bei fehlgeschlagenem Gruppenschritt).

**Gemockt statt echt:** `electron` (`app`, `dialog`, `safeStorage`, `ipcMain`) über
Modul-Mocks; `node:fs/promises` in `credentials.test.js`.

**Nur manuell prüfbar** (-> `docs/MANUAL-TEST.md`): echter `users/details`-Pfad und Shape,
echte `MAX_USERID_LENGTH`, Gruppenmitglieder-Shape, safeStorage-Backends,
Zertifikatsausnahme, Dialogverhalten von SweetAlert2, Build-Artefakt.

Keine Vue-Komponententests, keine E2E-Suite: GOAL Zeile 60 verlangt manuelle Abnahme,
Zeile 61/62 nur Generator- und Batch-Tests.

`tests/fixtures/`:
`import-ok.csv` · `import-semikolon.csv` · `import-komma.csv` · `import-bom-crlf.csv` ·
`import-leer.csv` · `import-nur-header.csv` · `import-header-falsch.csv` ·
`import-spaltenzahl.csv` · `import-quote-unbalanciert.csv` · `import-datum-formate.csv` ·
`import-datum-ungueltig.csv` · `import-datum-zukunft.csv` · `import-doppelzeile.csv` ·
`import-cjk.csv` · `import-kollision.csv` · `import-lange-namen.csv` ·
`import-2001-zeilen.csv` · `userliste-mit-header.csv` · `userliste-ohne-header.csv` ·
`ocs-users-details.json` · `ocs-users-ids.json` · `ocs-user-single.json` ·
`ocs-quota-shapes.json` · `ocs-groups.json` · `ocs-group-members-array.json` ·
`ocs-group-members-object.json` · `ocs-error-401.json` · `ocs-error-403-997.json` ·
`ocs-html-antwort.html`

## 12. Offene technische Risiken

| Risiko | Gewählte Abfederung |
|---|---|
| `users/details` Pfad/Shape unverifiziert | Probe mit fünf expliziten Fallback-Triggern, Session-Memo, identischer `UserView` auf beiden Wegen |
| `MAX_USERID_LENGTH` unbekannt | Konstante `MAX_USERID = 64` an einer Stelle; Kürzungstest hängt am Konstantenwert, nicht an 64 |
| Gruppenmitglieder-Shape unverifiziert | Zwei akzeptierte Shapes, sonst benannte Fehlermeldung statt stiller leerer Liste |
| Quota-Felder inkonsistent / `null` | `kind: 'unknown'` als erster Klasse-Zustand; Dashboard zeigt vier Werte statt einer Summe (DECISIONS 32) |
| 429 durch Tippfehler im Verbindungstest | Eigene Meldung `server_blockt_vorerst`, kein automatischer Wiederholungsversuch im Testdialog |
| Brute-Force-Sperre durch Batch-Last | Parallelität fest 4, 429-Backoff 2 s/6 s, danach Item-Fehler |
| safeStorage still auf Klartext | Backendprüfung vor jedem Speichern, `basic_text` persistiert nie, sichtbarer Sitzungshinweis |
| Klartextpasswörter im Export | Warnung vor dem Speicherdialog, nutzergewählter Pfad, Liste beim Verlassen der Ansicht verworfen |
| Kollisionsname kodiert das Geburtsdatum | Geburtsdatum nur in Vorschau und Export sichtbar, nirgends sonst, nie geloggt |
| Teilerfolg bei `user.create` mit Gruppe | Getrennte Schritte, Status `teilweise` mit benanntem Schritt, kein Rollback |
| Groß-/Kleinschreibung bei User-IDs | Jede Existenz- und Kollisionsprüfung vergleicht case-insensitiv |
| Vorschauzahl weicht von Rohauswahl ab | Löschbestätigung nutzt ausschließlich `aenderungen.length` aus dem Dry-Run |

## 13. Ausdrücklich NICHT gebaut

- Pinia — ein reaktives Modul `state.js` reicht für fünf Views.
- vue-router — eine `ref('dashboard')` plus `<component :is>`; fünf Views, keine URLs, kein Deep-Link-Bedarf.
- axios — Node-`fetch` ist im Main vorhanden.
- papaparse — "simple CSV" ohne Quoting ist ein ~40-Zeilen-Modul.
- electron-store — ein Datensatz, eine JSON-Datei, keine Profile.
- Job-Registry, Queue-Klasse, State Machine, Event-Bus — ein Pool, ein Stop-Flag, eine Ergebnisliste.
- AbortController im Batch — DECISIONS 42 verlangt, dass laufende Requests fertiglaufen.
- Persistenzschicht für den Jobverlauf — DECISIONS 33: letzte 5 im Speicher.
- Globale OCS-Fehlertabelle — Codes sind endpunktspezifisch (REVIEW-NOTES 3).
- API-Versionsverhandlung / pluggable Adapter — eine Probe mit Session-Memo genügt.
- Batch-Aktion "Einstellungen ändern" / Anzeigename-Umformatierung — gestrichen (DECISIONS 36).
- Rollback oder Kompensation für Teilfehler — nicht verlässlich erreichbar, Admin lässt erneut laufen.
- Subadmin-Endpunkte, Gruppen-Anzeigename-Editierung, Paginierung, LDAP, Light Theme, i18n — nicht in GOAL.
- Freitext-Kontingent — nur Presets 1/2/5/10/20 GiB und unbegrenzt (DECISIONS 38).
- Vue-Komponententests und E2E — Abnahme ist manuell (DECISIONS 20).
- Auto-Connect beim Start — explizites Verbinden, damit ein abgelehntes Passwort nicht
  unbemerkt die Brute-Force-Verzögerung startet.
