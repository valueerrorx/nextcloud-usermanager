# Architektur

Stand 2026-10-05. Bindend für Coder und Reviewer. Quellen: `CLAUDE.md`, `docs/GOAL.md`,
`docs/DECISIONS.md` (hat Vorrang bei Widersprüchen), `docs/RESEARCH-OCS.md`,
`docs/RESEARCH-UPN.md`, `docs/SPEC-CRITIQUE.md`, `docs/REVIEW-NOTES.md`.
Zitierweise: Verweise auf `DECISIONS.md` erfolgen **über den Fragetext** in Anführungszeichen,
nie über Zeilennummern — die verschieben sich bei jeder Ergänzung
(DECISIONS „Zitierweise auf DECISIONS“).

## 1. Überblick

Drei Prozesse, kein Framework dazwischen. Der **Renderer** (Vue 3, Vite) hält die geladene
Userliste im Speicher, rechnet Vorschauen und Vorschläge mit **puren Modulen** (`src/shared/`)
und ruft über eine **namentlich aufgelistete Preload-API** den **Main-Prozess**. Nur Main spricht
HTTP (Node-`fetch`), kennt das App-Passwort und greift auf das Dateisystem zu.
Alle Mengenoperationen — auch Einzel-User-Aktionen und der CSV-Import — laufen durch *eine*
Action-Pipeline mit fester Parallelität 4. Es gibt keinen Store, keinen Router, keine
Persistenzschicht, keine Queue-Klasse, kein Event-Bus, keine State Machine.
Projekt ist ESM (`"type": "module"`); **einzige** Ausnahme ist das Preload als CommonJS
(`src/preload/index.cjs`), weil `sandbox: true` keine ESM-Preloads lädt.
Neue Laufzeit-Abhängigkeiten gegenüber `CLAUDE.md`: **keine**.

## 2. Verzeichnisstruktur

```
package.json                      "type": "module"; scripts: dev, test, lint, build
                                  (Namen exakt wie CLAUDE.md); devDependency electron >= 28
vite.config.js                    Renderer-Build, root = src/renderer, out = dist/renderer
electron-builder.yml              Linux-Target (AppImage) für npm run build
eslint.config.js                  Flat config, ESM + Override sourceType commonjs für
                                  src/preload/index.cjs
vitest.config.js                  Umgebung node, Tests aus tests/
scripts/dev.mjs                   startet Vite über dessen JS-API im eigenen Prozess
                                  (createServer/listen, URL aus server.resolvedUrls.local[0]),
                                  danach Electron als einziger Kindprozess. Keine stdout-Regex,
                                  kein Polling, keine neue Abhängigkeit

src/main/
  index.js                        app-Bootstrap, BrowserWindow, single-instance, lädt ipc.js
                                  und tls.js; re-exportiert BROWSER_WINDOW_OPTIONS
                                  KEIN top-level await vor app.whenReady() — ESM-Main wird
                                  asynchron geladen, sonst wird 'ready' verpasst
  windowOptions.js                BROWSER_WINDOW_OPTIONS als eigenes Modul, damit
                                  tests/mainWindow.test.js es ohne electron-Mock importieren kann
  ipc.js                          EINZIGER Ort mit ipcMain.handle/on; registriert die Kanäle aus §3
  session.js                      Sitzungszustand im Speicher: Credentials, adminUserId (aus dem
                                  eingegebenen Loginnamen), userListMode-Memo, Zertifikatsausnahme,
                                  Stop-Flags je jobId. Keine Platte
  credentials.js                  safeStorage-Backendprüfung + JSON-Datei in app.getPath('userData')
  tls.js                          certificate-error-Handler, Fingerprint, Ausnahme-Freigabe
  log.js                          dbg(string) — no-op wenn app.isPackaged; nimmt nur Strings
  files.js                        dialog.showOpenDialog/showSaveDialog + Lesen/Schreiben von CSV
  ocs/client.js                   Request-Builder (Basic Auth, OCS-APIRequest, format=json),
                                  Envelope-Unwrap, Result-Typ, Retry/Backoff
  ocs/errors.js                   mapOcsError(result, endpointMap, fallbackId) — nimmt die Map mit
  ocs/connection.js               checkConnection(): /cloud/users?limit=1 + Fehlerklassifikation
  ocs/users.js                    User-Endpunkte, jede Funktion mit EIGENER Fehlercode-Map
  ocs/groups.js                   Gruppen-Endpunkte, jede Funktion mit EIGENER Fehlercode-Map
  ocs/userList.js                 users/details-Probe, Session-Memo, N+1-Fallback mit Fortschritt
  actions/pipeline.js             runJob({ ..., shouldStop }): Pool 4, Fortschritts-Events,
                                  Ergebnisliste; shouldStop wird injiziert, kein session-Zugriff
  actions/operations.js           Action-ID -> OCS-Aufrufe (ein bis zwei Schritte je Item)

src/preload/
  index.cjs                       CommonJS: contextBridge.exposeInMainWorld('api', { ...explizit })

src/shared/                       PURE MODULE: kein import von node:*, electron, fetch, fs
  username.js                     normalizeComponent, buildUsername, normalizeOrder (1:1-Port)
                                  + Zeichensatz, reservierte Namen, MAX_USERID, truncateToFit
  birthdate.js                    parseBirthdate -> ddmmyyyy, Kalenderprüfung, Zukunftsprüfung
  password.js                     validatePrefix, buildInitialPassword, checkMinLength,
                                  beispielPasswort (Live-Beispiel im Import-Dialog)
  csvImport.js                    zwei Exporte: Import-CSV (Vorname;Nachname;Geburtsdatum) und
                                  Username-Liste (ein Name je Zeile, optionaler Header)
  importPlan.js                   Stufen 10-18 aus §6: Zeilen -> Vorschauzeilen mit Status
  quota.js                        defensiver Quota-Reader + Presets + formatQuotaForApi + formatBytes
  pool.js                         runPool(items, worker, { concurrency, shouldStop })
  dryRun.js                       planActions(): Änderungen / keine Änderung / ausgeschlossen
  resultCsv.js                    Ergebniszeilen -> CSV-Text (fixe Spalten aus §5)
  userView.js                     Normalisierung Roh-OCS-User -> Renderer-Shape (§4)
  filters.js                      Suchprädikat, quotaStufe (5 Stufen), Filter, Sortierung
                                  (localeCompare 'de')
  dashboard.js                    storageTotals (4 Werte), fastVollListe (>90 %, sortiert, Kappung
                                  bei 20), userCounts, historyCounts — alles Rechnen fürs Dashboard
  url.js                          normalizeBaseUrl: https erzwingen, Pfad säubern
  messages.js                     messageId -> deutscher Text (einzige UI-Textquelle)

src/renderer/
  index.html                      Einstiegspunkt Vite
  main.js                         createApp, importiert theme.css und SweetAlert2
  App.vue                         dunkle Shell, Sidebar, Zertifikats-Banner, aktive View
  state.js                        reaktive refs: connection, users, groups, jobs(5), ladezustände
  styles/theme.css                Dark-Theme-Tokens, kein Light-Pfad
  views/ConnectView.vue           Server-URL, Admin, App-Passwort, verbinden
  views/DashboardView.vue         rendert NUR die Rückgaben von shared/dashboard.js, rechnet nichts
  views/UsersView.vue             Tabelle, Suche/Filter/Sortierung, Mehrfachauswahl, Aktionsleiste
  views/GroupsView.vue            Gruppen anlegen/löschen, Mitglieder, User zu/ab
                                  — braucht die geladene Userliste (Mitglieder + memberCount)
  views/ImportView.vue            CSV wählen, Optionen, Vorschautabelle, Anlegen, Export
                                  — braucht groups.list vor dem Öffnen (Zielgruppenauswahl)
  components/UserTable.vue        Tabelle inkl. "alle auswählen" = aktuelles Filterergebnis
  components/ActionBar.vue        Aktionsauswahl, Dry-Run-Aufruf, Bestätigungen (swal2)
  components/JobProgress.vue      Fortschritt, Abbrechen, Ergebnisbericht, CSV-Export
  components/StateBlock.vue       Loading / Empty / Error für Tabelle, Gruppen, Dashboard
  components/QuotaCell.vue        rendert quota.js/filters.js-Output, rechnet und formatiert nichts

tests/                            je getestetes Modul genau eine Datei (Abgleich mit §11)
  username.test.js                14 Zeilen RESEARCH-UPN §11 + 5 Fixtures §10, Zeichensatz,
                                  reservierte Namen, truncateToFit
  birthdate.test.js               beide Formate, 31.02.2010, Zukunft, Müll
  password.test.js                Prefix-Validierung, Passwortbildung, Mindestlänge, Live-Beispiel
  csvImport.test.js               je ein Fall pro Datei-/Zeilenfehler aus §6 + Userliste
                                  mit/ohne Header, Leerzeilen, Duplikate
  importPlan.test.js              die vier Fälle aus §6.1 + Status-Matrix + Fehler-IDs
  quota.test.js                   alle sechs Shapes aus RESEARCH-OCS §4 + formatBytes
  pool.test.js                    Parallelität 4, Stop-Callback, jedes Item genau einmal
  dryRun.test.js                  No-Ops, Selbstschutz, Ausschlüsse, Zählwerk
  resultCsv.test.js               Spalten, Trennzeichen, Maskierung, Passwortspalte, Zeilennummer
  filters.test.js                 Suchprädikat, Sortierung mit Umlauten, fünf quotaStufe-Fälle
  dashboard.test.js               vier Speicherwerte, fastVoll-Prädikat/Sortierung/Kappung,
                                  userCounts, historyCounts mit teilweise
  userView.test.js                beide Lesewege -> gleiche Identitätsfelder, Quota-Degradation
  messages.test.js                jede messageId aus §6/§7 hat einen deutschen Text, keine Waisen
  url.test.js                     Trailing Slash, /index.php, http abgelehnt
  credentials.test.js             basic_text -> nicht persistieren, Keyring -> Base64-Blob
  skeleton.test.js                S01-Gerüstfakten: package.json (type/main/scripts/gepinnte
                                  electron-Version/keine verbotenen devDeps), vite base './',
                                  relative Asset-Pfade im Build (Scratch-outDir, dist/ bleibt
                                  unberührt), Preload VERHALTENSBASIERT über createRequire +
                                  electron-Stub geprüft. Die S01-Zusicherung „src/shared/ fehlt" ist
                                  mit S02 entfernt — das Verzeichnis existiert ab dann
  ipc.test.js                     genau ein Kanal 'app.version', Rueckgabe { ok, version }
  index.test.js                   second-instance: Fenster wiederherstellen/fokussieren,
                                  zerstoertes Fenster wird nicht dereferenziert
  theme.test.js                   genau die sechs Theme-Tokens mit festen Hex-Werten
  mainWindow.test.js              BROWSER_WINDOW_OPTIONS: contextIsolation/sandbox/nodeIntegration
  ocsClient.test.js               gemockte fetch: 100/401/403/429/HTML/Netzfehler, Header-Pflicht
  ocsUsers.test.js                endpunktspezifische Codes -> messageId, user.update 1-2 Schritte
  ocsGroups.test.js               102/103/101 je Endpunkt
  userList.test.js                details-Probe, Fallback-Trigger, Session-Memo
  pipeline.test.js                50 Items, 7 Fehler, ein 429, Abbruch bei 20 (injizierter
                                  shouldStop-Callback, kennt session nicht)
  session.test.js                 Jobzustand laufend/beendet, Stop-Flag-Aufräumen im finally,
                                  actions.stop -> gestoppt/bereits_beendet/unbekannt
  fixtures/                       siehe §11
```

**Modulformate und `npm run dev`** (DECISIONS „Preload-Modulformat“):
- `package.json` hat `"type": "module"`. Main-Prozess und `src/shared/` sind ESM. Das setzt
  **Electron >= 28** voraus (ESM-Unterstützung im Main-Prozess); die devDependency wird auf
  `>=28` gepinnt und als aktuelle stabile Major installiert.
- `src/preload/index.cjs` ist die **einzige** CommonJS-Datei: mit `sandbox: true` lädt Electron
  nur CJS-Preloads. `eslint.config.js` erhält dafür einen Override
  (`files: ['src/preload/index.cjs'], languageOptions: { sourceType: 'commonjs' }`).
- `npm run dev` = `node scripts/dev.mjs`. Das Skript startet Vite über die **JS-API**
  (`createServer()`, `await server.listen()`), liest die URL aus `server.resolvedUrls.local[0]`
  und startet danach `node_modules/.bin/electron .` mit `VITE_DEV_SERVER_URL` in der Umgebung.
  Vite läuft damit **im Node-Prozess selbst**, Electron ist der einzige Kindprozess — kein
  stdout-Parsing, kein Port-Polling. Teardown: Electron beendet -> Vite schließen und mit
  Electrons Exitcode enden; `SIGINT`/`SIGTERM` -> beide beenden, keine Waisenprozesse.
  **Keine neue Abhängigkeit** (kein `concurrently`, kein `electron-vite`).
  `src/main/index.js` lädt `VITE_DEV_SERVER_URL`, falls gesetzt, sonst `dist/renderer/index.html`.

## 3. IPC-Vertrag (vollständig und abschließend)

Preload exponiert genau diese Methoden. **Kein generisches `invoke(channel, ...)`.**
Alle `invoke`-Kanäle werfen nie; sie liefern `Result = { ok: true, ...}` oder
`{ ok: false, messageId, message, httpStatus?, ocsCode? }`.
**Das App-Passwort ist in keinem Rückgabewert, keinem Event und keiner Meldung enthalten —
auch nicht maskiert.** Es fließt ausschließlich Renderer -> Main, nie zurück.

| Methode | Richtung | Argument | Rückgabe | Fehlerfälle |
|---|---|---|---|---|
| `app.version` | invoke | – | `{ ok: true, version }` | – (kann nicht fehlschlagen) |
| `connection.connect` | invoke | `{ baseUrl, adminUser, appPassword, remember }` | `{ ok, status }` | URL ungültig, 401, 403/997, 429, HTML-Antwort, Netz, Zertifikat, `secret_nicht_gespeichert` |
| `connection.connectSaved` | invoke | – | `{ ok, status }` | `kein_gespeicherter_zugang`, 401 -> `gespeichertes_passwort_abgelehnt` |
| `connection.status` | invoke | – | `{ connected, baseUrl, adminUserId, secretStorage, certException, hasSaved, savedBaseUrl, savedAdminUser }` | – |
| `connection.forgetSaved` | invoke | – | `{ ok }` | Schreibfehler |
| `users.list` | invoke | – | `{ ok, users: UserView[], mode, fetchedAt }` | 401, 429, Netz, `details_und_fallback_fehlgeschlagen` |
| `users.onLoadProgress` | main->renderer | – | `{ done, total }` | – (nur im N+1-Fallback) |
| `groups.list` | invoke | – | `{ ok, groups: GroupView[] }` | 401, 429, Netz |
| `groups.create` | invoke | `{ groupId }` | `{ ok }` | 101/102/103 je Endpunkt-Map |
| `groups.delete` | invoke | `{ groupId }` | `{ ok }` | 101/102, `admin_gruppe_geschuetzt` |
| `actions.run` | invoke | `{ jobId, action, items, params }` | `{ ok, results: ItemResult[], summary }` | nie global fehlerhaft; Fehler stehen je Item |
| `actions.stop` | invoke | `{ jobId }` | `{ ok, zustand: 'gestoppt' \| 'bereits_beendet' \| 'unbekannt' }` | nie Fehler, siehe §5 |
| `actions.onProgress` | main->renderer | – | `{ jobId, done, total, result }` | – |
| `tls.onCertificatePrompt` | main->renderer | – | `{ requestId, host, fingerprint, subject, issuer, validTo }` | – |
| `tls.respondCertificate` | invoke | `{ requestId, akzeptiert }` | `{ ok }` | abgelaufene requestId |
| `files.openCsv` | invoke | `{ zweck: 'import' \| 'userliste' }` | `{ ok, path, text }` | `abgebrochen`, Lesefehler |
| `files.saveCsv` | invoke | `{ vorschlag, inhalt }` | `{ ok, path }` | `abgebrochen`, Schreibfehler |

**Verschlankungen gegenüber dem ersten Entwurf** (DECISIONS „IPC-Verschlankung“):
- Es gibt **keinen** Kanal `connection.test`. `connect` *ist* der Test: es prüft
  `GET /cloud/users?limit=1` und füllt die Session **nur bei Erfolg**. Ein Fehlschlag lässt
  die Session unberührt, also auch das Passwort nicht im Speicher.
- `connect` liefert **kein** `adminUserId` und **kein** `isAdmin` aus der API. Admin-Rechte sind
  genau dann gegeben, wenn der Testrequest `100` liefert (sonst 403/997 -> `kein_admin`).
  Die `adminUserId` ist der **eingegebene Loginname**, nicht API-abgeleitet
  (DECISIONS „Ermittlung des verbundenen Admin-Accounts“), weil `GET /cloud/user` im Research
  nicht belegt ist. **Der Selbstschutz aus §5 hängt an diesem Wert**: Vergleich immer
  `toLowerCase()`-normalisiert gegen `UserView.userid`, damit `Admin` und `admin` derselbe
  Account sind.
- `connection.savedHint` entfällt; `hasSaved`/`savedBaseUrl`/`savedAdminUser` sind Felder auf
  `connection.status`. Ein Aufruf weniger beim Start.
- `connection.disconnect` entfällt: es gibt keinen Zustand, der ohne Neustart zurückgesetzt
  werden müsste, und ein „Zugang löschen“ ist `connection.forgetSaved`.
- `groups.members` entfällt. Die Mitgliederliste wird im Renderer aus der geladenen Userliste
  abgeleitet (`users.filter(u => u.groups.includes(g))`) — genau wie `memberCount` ohnehin schon.
  Damit entfällt auch der unverifizierte Response-Shape und die messageId
  `antwort_shape_unbekannt`.
- `users.list` hat **keinen** `refresh`-Parameter: jeder Aufruf lädt neu, der Renderer
  entscheidet über das Caching in `state.js`.
- `files.openCsv` hat **keine** Größenprüfung. Die harte Grenze von 2000 Zeilen
  (DECISIONS „Zeilenobergrenze Import-CSV“) deckt den Fall fachlich ab; eine zweite Grenze in MB
  wäre eine zweite Fehlermeldung für dieselbe Ursache.

### 3.1 Datenfluss der Hauptfälle

1. **Verbinden:** `ConnectView` -> `connection.connect` -> `ocs/connection.js`
   -> `GET /cloud/users?limit=1` -> bei `100`: `session` füllen (+ optional `credentials.js`)
   -> `{ ok, status }` -> Shell schaltet die übrigen Views frei.
2. **Userliste:** `UsersView` -> `users.list` -> `ocs/userList.js` (`details` oder N+1 mit
   `users.onLoadProgress`) -> `shared/userView.js` -> `UserView[]` -> `state.users`;
   Suche/Filter/Sortierung laufen danach **nur** clientseitig über `shared/filters.js`.
3. **Batch-Aktion:** `UserTable` (Auswahl) -> `ActionBar` -> `shared/dryRun.js` (pur)
   -> swal2-Bestätigung -> `actions.run` -> `actions/pipeline.js` -> `operations.js`
   -> `ocs/*` -> `actions.onProgress` je Item -> `results` + `summary` -> `JobProgress`
   -> `shared/resultCsv.js` -> `files.saveCsv`.
4. **CSV-Import:** `files.openCsv` -> `shared/csvImport.js` (Stufen 1-9)
   -> `shared/importPlan.js` (Stufen 10-18, braucht das Server-User-Set aus `state.users`)
   -> Vorschau -> swal2 -> optional `groups.create` -> `actions.run` mit `user.create`
   -> Bericht + Passwort-Export.
5. **Gruppen:** `GroupsView` -> `groups.list`; Mitglieder und `memberCount` werden lokal aus
   `state.users` abgeleitet; `groups.create`/`groups.delete` für Änderungen.

**Zwei Abhängigkeiten zwischen Views, die der Coder einhalten muss:**
- `GroupsView` braucht die **geladene Userliste** (Mitglieder + `memberCount` kommen daraus).
  Ist `state.users` leer, lädt die Ansicht sie zuerst nach und zeigt bis dahin den
  Ladezustand von `StateBlock.vue`.
- `ImportView` braucht **`groups.list` zuerst**, weil nur servergelesene Gruppen auswählbar
  sind. Ohne geladene Gruppen bleibt die Zielgruppenauswahl deaktiviert mit Hinweis statt
  mit leerer Liste.

Nicht vorhanden und auch nicht nachzurüsten: Kanäle für Joblisten-Persistenz, Einzel-User-Kanäle
(laufen über `actions.run`), Shell-/Pfad-Zugriffe, `openPath`.
Der Jobverlauf (letzte 5, DECISIONS „Dashboard Batch-Job-Historie“) liegt in `renderer/state.js`
im Speicher — kein Kanal nötig.

## 4. Datenmodell

`UserView` (einzige Form, die der Renderer sieht; erzeugt von `shared/userView.js`):

```js
{ userid, displayname, email: string|null, enabled: boolean,
  groups: string[], quota: QuotaInfo, istVerbundenerAdmin: boolean }
```

`GroupView`: `{ id, memberCount }` — `memberCount` **und** die Mitgliederliste werden clientseitig
aus `UserView.groups` abgeleitet, nicht per Request (DECISIONS „Größenordnung der Zielinstanz“:
unter 5000 User, Liste ist ohnehin komplett geladen). Deshalb setzt die Gruppenansicht eine
geladene Userliste voraus und lädt sie bei Bedarf selbst nach.

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
Skalar `0` ist bewusst `unknown`, nicht `limited: 0` (DECISIONS „Deutung von `quota: 0`“):
Nextcloud liefert 0 auch für "kein Kontingent gesetzt", eine Prozentrechnung wäre undefiniert.
Dadurch fällt der Fall automatisch aus der >90-%-Liste und aus der Summe der begrenzten
Kontingente heraus.

### 4.1 Abgeleitete Werte: benannte pure Funktionen, kein Rechnen in Vue

DECISIONS „Berechnungen gehören nie in Vue-Komponenten“ ist bindend: `DashboardView.vue` und
`QuotaCell.vue` rufen nur auf und rendern. Jede Funktion hier hat einen Testeintrag in §11.

| Funktion | Signatur | Semantik |
|---|---|---|
| `storageTotals` | `(users: UserView[]) -> { genutztBytes, summeBegrenztBytes, anzahlUnbegrenzt, anzahlUnbekannt }` | die vier Dashboard-Speicherwerte (DECISIONS „Dashboard-Kachel Speicher“); `genutztBytes` summiert nur `usedBytes != null`, `summeBegrenztBytes` nur `kind === 'limited' && limitBytes > 0`; keine Gesamtsumme |
| `istFastVoll` | `(u: UserView) -> boolean` | `quota.kind === 'limited' && limitBytes > 0 && usagePercent > 90`; `unlimited`, `unknown` und `limitBytes === 0` sind ausgeschlossen |
| `fastVollListe` | `(users, { max = 20 }) -> { eintraege: UserView[], weitere: number }` | filtert mit `istFastVoll`, sortiert **absteigend** nach `usagePercent`, kappt bei `max`; `weitere` füllt den Text „und n weitere“ (DECISIONS „Fast voll“-Liste) |
| `userCounts` | `(users) -> { gesamt, aktiv, deaktiviert }` | Kennzahlen der Dashboard-Kacheln |
| `historyCounts` | `(summary) -> { ok, fehler, teilweise }` | `fehler = summary.fehler + summary.teilweise`, `teilweise` zusätzlich separat (§5) |
| `formatBytes` | `(bytes: number\|null) -> string` | `null` -> „unbekannt“; GiB-Basis 1024, eine Dezimalstelle, deutsches Komma |
| `quotaStufe` | `(q: QuotaInfo) -> 'unter50' \| 'f50bis90' \| 'ueber90' \| 'unbegrenzt' \| 'unbekannt'` | die **fünf** Filterstufen (DECISIONS „Quota-Filterstufen“, keine Checkbox): `limited` mit `usagePercent < 50` / `>= 50 && <= 90` / `> 90`, `unlimited` -> `unbegrenzt`, alles andere -> `unbekannt`. Der Filter in der Usertabelle vergleicht nur noch gegen diesen Rückgabewert |
| `matchesSuche` | `(u: UserView, q: string) -> boolean` | case-insensitiver Teilstring über `userid`, `displayname`, `email` (DECISIONS „Suche in der Usertabelle“); leerer/getrimmt leerer Query -> `true` |
| `beispielPasswort` | `(prefix: string) -> string` | Live-Beispiel im Import-Dialog, feste Beispielsgeburtsdaten `01012010`, z. B. `Schule01012010!`; dieselbe Funktion wie die echte Bildung, nur mit Beispielsdatum |

Ablage: `istFastVoll`, `fastVollListe`, `storageTotals`, `userCounts`, `historyCounts` in
`shared/dashboard.js`; `formatBytes` in `shared/quota.js` (einzige Stelle, die Quota-Zahlen
in Text verwandelt); `quotaStufe` und `matchesSuche` in `shared/filters.js`;
`beispielPasswort` in `shared/password.js`.

## 5. Action-Pipeline

Ein Pfad für alles (DECISIONS „Einzel-User-Aktionen“). `actions.run` bekommt eine Liste von Items;
eine Einzelaktion ist eine Liste der Länge 1, der Import eine Liste von Vorschauzeilen.

Action-IDs: `user.enable`, `user.disable`, `user.delete`, `user.setQuota`, `user.update`
(displayname/email, Einzelansicht), `user.setPassword`, `user.addToGroup`,
`user.removeFromGroup`, `user.create`.

`operations.js` liefert pro Action `{ label, steps(item, params) -> Step[] }`.
**Zwei** Actions sind mehrschrittig:
- `user.create` = `POST /cloud/users` (userid, password, displayName, quota) und danach je
  Zielgruppe `POST /cloud/users/{id}/groups`. *Begründung:* das Verhalten von `groups[]` im
  Create-Call bei Gruppenfehlern ist unverifiziert; getrennte Schritte machen einen Teilfehler
  benennbar statt den Gesamtzustand unklar zu lassen.
- `user.update` = **1 bis 2** Schritte. `PUT /cloud/users/{userid}` nimmt genau **ein**
  `key`/`value`-Paar (RESEARCH-OCS §3, DECISIONS „`user.update` ist nicht einschrittig“).
  Anzeigename *und* E-Mail ändern sind also zwei Requests; schlägt einer davon fehl, ist
  `teilweise` ein **legitimes** Endergebnis, kein Bug. Wird nur ein Feld geändert, bleibt es
  bei einem Schritt. `user.setQuota` und `user.setPassword` sind ebenfalls `PUT` mit einem Paar
  und damit einschrittig.

Ablauf in `pipeline.js` — `runJob({ jobId, action, items, params, shouldStop })`:
1. Items in `shared/pool.js` mit `concurrency: 4` (DECISIONS „Parallelität im Batch“,
   Konstante `CONCURRENCY = 4`).
2. Vor jedem Dispatch `shouldStop()` aufrufen. Der Callback wird **injiziert**, genau wie bei
   `pool.js`; `pipeline.js` liest **nicht** das `session`-Singleton
   (DECISIONS „`pipeline.js` und der Stop-Flag“). `ipc.js` übergibt
   `() => session.shouldStop(jobId)`, der Test übergibt eine eigene Funktion — das macht den
   Abbruch ohne Electron-Mock testbar. Flag gesetzt -> restliche Items ohne Request als
   `nicht ausgeführt` verbuchen. **Gewählt: Stop-Dispatch-Flag, kein AbortController** —
   DECISIONS „Abbruch-Semantik im Batch“ verlangt, dass laufende Requests fertiglaufen.
3. Pro Schritt Retry-Politik aus `ocs/client.js`: HTTP 429 -> bis zu 2 Wiederholungen mit 2 s / 6 s;
   Netzfehler und 5xx -> genau eine Wiederholung. Ein 429 wird erst nach erschöpften Retries ein
   Fehler. **Kein Pausendialog** (DECISIONS „429-Pausendialog im Batch“: gestrichen) — erschöpfte
   Retries sind ein normaler Item-Fehler mit der Begründung `server_blockt_vorerst`, der Job
   läuft weiter bis zum Ende.
4. Nach jedem Item `actions.onProgress`. Jedes Item erscheint **genau einmal** im Ergebnis.
5. `ipc.js` umschließt den `runJob`-Aufruf mit `try/finally`. Im `finally` wird **nur das
   Stop-Flag** der `jobId` entfernt und der Jobzustand auf `'beendet'` gesetzt — egal ob der Job
   normal endete, abgebrochen wurde oder warf. Kein Leck über die Sitzungsdauer.

`session` hält pro `jobId` einen Zustand `'laufend' | 'beendet'`, der **nicht** aufgeräumt wird;
nur das Stop-Flag wird freigegeben. Ohne diesen Zustand könnte `actions.stop` einen beendeten Job
nicht von einem nie gestarteten unterscheiden.

`actions.stop({ jobId })` wirft nie und liefert einen definierten Zustand:
`'gestoppt'` (Zustand `'laufend'`, Flag gesetzt), `'bereits_beendet'` (Zustand `'beendet'` — der
Renderer zeigt dann nur den vorhandenen Bericht), `'unbekannt'` (jobId ist in `session`
unbekannt). Ein doppelter Klick auf „Abbrechen“ ist dadurch harmlos und kein Fehlerdialog.

**Testzuordnung:** Diese Zustandslogik gehört zu `ipc.js`/`session.js` und wird in
`tests/session.test.js` geprüft, **nicht** in `pipeline.test.js` — `pipeline.js` kennt `session`
per Konstruktion nicht und kann die Aufräumlogik nicht sehen.

`ItemResult`:

```js
{ userid, aktion, status: 'ok'|'fehler'|'nicht ausgeführt'|'teilweise',
  grund: string, httpStatus: number|null, ocsCode: number|null,
  schritte?: [{ name, status, grund }] }
```

`summary` (DECISIONS „`summary`-Form des Action-Ergebnisses“):

```js
{ ok: number, fehler: number, nichtAusgefuehrt: number, teilweise: number }
```

Die Summe der vier Zähler ist immer `items.length`. `teilweise` **widerspricht** den drei
entschiedenen Zuständen aus „Abbruch-Semantik im Batch“ nicht, sondern verfeinert sie: es
entsteht nur bei mehrschrittigen Actions (`user.create`, `user.update`) und nur, wenn
mindestens ein Schritt `ok` und mindestens einer `fehler` ist. Kein Rollback, keine Kompensation.
Die Jobverlauf-Kachel zählt `teilweise` **in die Fehlerspalte** und weist es **zusätzlich
separat** aus („3 Fehler, davon 1 teilweise“) — berechnet von `dashboard.js#historyCounts`,
nicht im Template.

**Dry-Run** (`shared/dryRun.js`, pur, kein Re-Fetch — rechnet nur auf der geladenen Liste):
`planActions(action, auswahl, params, { adminUserId })` ->
`{ aenderungen: [...], keineAenderung: [...], ausgeschlossen: [{ userid, grund }] }`.
- `keineAenderung`: schon aktiv/deaktiviert, schon in Gruppe, nicht in Gruppe, Kontingent identisch.
- `ausgeschlossen`: `nicht gefunden` (nur bei Username-CSV-Auswahl, DECISIONS „Batch-Input
  CSV-Liste von Usernamen“) und `eigener Admin-Zugang` bei `user.delete`/`user.disable`
  (DECISIONS „Selbstschutz“). Der Vergleich ist
  `u.userid.toLowerCase() === adminUserId.toLowerCase()`, wobei `adminUserId` der eingegebene
  Loginname ist (§3). Der Selbstschutz sitzt **in diesem puren Modul**, damit Einzel- und
  Batchweg ihn gemeinsam erben und er testbar ist.
- "Alles auswählen" liefert immer nur das aktuelle Filterergebnis.

**Bestätigungen** (swal2): jede Aktion zeigt den Dry-Run. Bei `user.delete` zusätzlich Eingabe der
Dezimalzahl aus `aenderungen.length` (DECISIONS „Löschbestätigung“): getrimmter exakter
Stringvergleich, Button bis zur Übereinstimmung deaktiviert, kein Versuchslimit, auch bei n = 1.
Einzellöschung läuft über denselben Dialog, zeigt zusätzlich die `userid`.
Der Löschdialog enthält **immer** den Hinweistext, dass Nextcloud **die Dateien der betroffenen
User mitlöscht** (DECISIONS „Batch-Löschen: Hinweis auf Dateien“) — auch bei n = 1.

**Ergebnis-CSV** (`shared/resultCsv.js`): UTF-8 mit BOM, Trennzeichen `;`, CRLF, Spalten
`userid;aktion;status;grund;httpStatus;ocsCode` (DECISIONS „Ergebnis-CSV Spalten“) — identisch für
Batch-Bericht und Import-Export, Fehler- und `nicht ausgeführt`-Zeilen enthalten. Der
Import-Export hängt eine **siebte** Spalte `passwort` an, nur gefüllt bei `ok`/`teilweise`
(DECISIONS „Ergebnis-CSV: Spalten des Import-Exports“).
Export auch nach Abbruch. Vor dem Speichern des Passwort-Exports swal2-Warnung, nur
nutzergewählter Pfad, kein Default im App-Verzeichnis, kein Auto-Open
(DECISIONS „Passwort-Export auf Platte“).

**Umfang des Import-Exports** (DECISIONS „Import-Ergebnis-Export Umfang“): exportiert werden die
Pipeline-Ergebnisse **plus** die schon in der Vorschau abgewiesenen Fehlerzeilen. Letztere haben
`aktion = 'user.create'`, `status = 'fehler'`, `grund` = der deutsche Text der Zeilenfehler-ID aus
§6, `httpStatus`/`ocsCode` leer, `passwort` leer. **Jede Zeile ohne ermittelten Kandidaten** — also jeder Fehler, der auftritt, bevor
Stufe 12 einen `kandidatA` erzeugt hat (z. B. `vorname_leer`, `datum_format`,
`name_nicht_abbildbar`, `doppelzeile`) — bekommt in Spalte 1 die **Zeilennummer** der CSV in der
Form `Zeile 17`. **Zeilen mit ermitteltem Kandidaten** tragen diesen Kandidaten in Spalte 1, auch
wenn sie danach scheiterten: `username_zu_lang` (Stufe 12 bzw. 14c) den gekürzten Kandidaten, und
die Kollisionsfehler aus 13 / 14b / 14d / 14f den **kollidierenden** Kandidaten. So ist jede
Eingabezeile auffindbar und der Admin sieht bei Kollisionen sofort, welcher Name belegt war. Damit ist jede Eingabezeile im Export
genau einmal auffindbar, und `resultCsv.js` braucht keine zweite Spaltendefinition.

## 6. Username-Generierung und Import-Pipeline

Reihenfolge der Stufen, von CSV-Bytes zur Vorschauzeile. Stufen 1-9 in `shared/csvImport.js`,
10-18 in `shared/importPlan.js`. Beide ohne I/O; die Bytes kommen aus `files.openCsv`.

**Signaturen der beiden komplexesten Module** — verbindlich, damit der Coder nichts erfindet:

```js
// shared/csvImport.js — Stufen 1-9
parseImportCsv(text)        -> { ok, rows: RawRow[], fileError? }
//   RawRow = { zeile, vorname, nachname, geburtsdatum, fehler? }
parseUserList(text)         -> { ok, usernames: string[], fileError? }   // Batch-Input

// shared/importPlan.js — Stufen 10-18
buildImportPlan({
  rows,              // RawRow[] aus parseImportCsv
  serverUserIds,     // string[], lowercase-normalisiert, aus state.users
  order,             // 'givenFirst' | 'surnameFirst'
  prefix,            // Passwort-Prefix, schon validiert
  max = MAX_USERID,  // Testbarkeit: §6.1 läuft mit max = 20
}) -> { rows: PreviewRow[], summary: { neu, kollisionAufgeloest, fehler } }
//   PreviewRow = { zeile, vorname, nachname, ddmmyyyy, username|null,
//                  status: 'neu'|'kollision_aufgeloest'|'fehler',
//                  gekuerzt: boolean, fehlerId?, displayname, passwort|null }

truncateToFit({ first, second, suffix, max }) -> { second, gekuerzt, passt }
//   first wird nie gekuerzt und daher nicht zurueckgegeben; passt=false -> username_zu_lang
```

`max` ist ein echtes Argument, kein Testhaken: §6.1 verlangt `max = 20` für lesbare Beispiele,
produktiv wird `MAX_USERID = 64` übergeben (DECISIONS „Test-seitiger `max`-Parameter“).
Die Nummerierung ist die **verbindliche Ausführungsreihenfolge**: jede Stufe sieht nur das
Ergebnis der vorherigen, und eine Zeile verlässt die Pipeline bei ihrem ersten Fehler.

1. UTF-8 dekodieren, BOM entfernen (Excel erzeugt eine).
2. CRLF und CR auf LF normalisieren, abschließende Leerzeilen verwerfen.
3. Trennzeichenerkennung an der Headerzeile: häufigeres von `;` und `,` gewinnt;
   **bei Gleichstand `;`** (deutsches Excel); kommt keines vor -> Dateifehler `header_fehlt`.
4. Header prüfen: genau `Vorname`, `Nachname`, `Geburtsdatum`, getrimmt, case-insensitiv.
5. Zeilenobergrenze 2000 (DECISIONS „Zeilenobergrenze Import-CSV“) -> sonst `zeilenlimit`.
6. Je Zeile splitten. **Kein RFC4180-Quoting** (DECISIONS „RFC4180-Quoting in der Import-CSV“):
   enthält ein Feld ein `"` in unbalancierter Zahl -> Zeilenfehler `quote_unbalanciert`.
   Falsche Spaltenzahl -> `spaltenzahl`.
7. Felder trimmen; leerer Vor- oder Nachname -> `vorname_leer` / `nachname_leer`.
8. Geburtsdatum: `dd.mm.yyyy` oder `yyyy-mm-dd` (DECISIONS „Erwartetes Geburtsdatums-Format“),
   intern immer `ddmmyyyy` (DECISIONS „Geburtsdatum-Normalform“).
   Nicht parsbar -> `datum_format`; kalendarisch ungültig (31.02.2010) ->
   `datum_ungueltig`; in der Zukunft -> `datum_zukunft`.
9. Dublette innerhalb der Datei: Vergleich von Vorname+Nachname+ddmmyyyy **auf dem Rohtext**,
   getrimmt und case-insensitiv, Schlüssel **`'|'`-getrennt** (`roh.toLowerCase()` je Feld, mit
   `'|'` gejoint — identisches Schema wie `identitaet` in Stufe 14). Ohne Trenner würden
   `Ann|Amarie` und `Anna|Marie` bei gleichem Geburtsdatum zu einer falschen `doppelzeile`
   verschmelzen. -> `doppelzeile`. Bewusst **nicht** über
   `normalizeComponent`: sonst würde `Anna Maria` / `AnnaMaria` hier schon wegfallen und der
   Fall `benutzer_existiert_bereits` aus Stufe 14b wäre unerreichbar.
10. `normalizeComponent` auf Vor- und Nachname (Regex-Kette exakt in der Reihenfolge
    RESEARCH-UPN §1, Schritte 1-8, 1:1 portiert). Ist eine Komponente `''` **oder besteht sie
    nur aus Punkten** (`/^\.+$/`) -> `name_nicht_abbildbar`
    (DECISIONS „Komponente normalisiert zu nur Punkten“). Punkte bleiben laut UPN-Spec in der
    Whitelist, Nextcloud lehnt reine Punkt-IDs aber ab — beide Fälle sind derselbe Fehler.
11. `order` aus dem Import-Dialog festlegen: `givenFirst` (Default) oder `surnameFirst`,
    unbekannte Werte fallen über `normalizeOrder` auf `givenFirst` zurück.
    Daraus steht fest, welche Komponente **links** steht; die Nachnamen-Komponente ist bei
    `surnameFirst` die linke.
12. **Kürzung ohne Suffix.** `MAX_USERID = 64` (eine Konstante, RESEARCH-OCS §7 defensiv).
    Gekürzt wird **komponentenweise**, nie am zusammengesetzten String
    (DECISIONS „Kürzung operiert auf Komponenten, nicht auf dem Gesamtstring“):

    ```js
    truncateToFit({ first, second, suffix, max })
      -> { second: string, gekuerzt: boolean, passt: boolean }
    ```

    `first` = die unverkürzbare Vornamen-Komponente, `second` = die kürzbare
    Nachnamen-Komponente — **nicht** „links/rechts“, sondern fest Vorname/Nachname,
    unabhängig von `order`. `suffix` = `''` oder `'.ddmmyyyy'`. Budget für `second` ist
    `max - first.length - 1 (Trennpunkt) - suffix.length`. Ist das Budget `>= second.length`,
    passiert nichts (`gekuerzt: false`). Ist es `>= 1`, wird `second` von rechts auf das Budget
    geschnitten (`gekuerzt: true`) — der Nachname behält **mindestens 1 Zeichen**. Ist es `< 1`,
    gilt `passt: false` -> Zeilenfehler `username_zu_lang`.
    Die Funktion ist reihenfolge-**unabhängig**, weil nur Längen zählen; der Aufrufer setzt
    danach mit `buildUsername(vn, nnGekuerzt, order) + suffix` zusammen. Genau deshalb darf
    **nicht** am Gesamtstring gekürzt werden: Rohnamen dürfen Punkte enthalten, und bei
    `surnameFirst` würde ein Schnitt „von rechts“ den Vornamen oder das Suffix treffen.
    Ergebnis dieser Stufe: `kandidatA` plus Flag `gekuerzt`.
13. **Kollision mit einem bestehenden Nextcloud-User** (case-insensitiv,
    DECISIONS „Vergleich bei Username-Kollisionen“). Ist `kandidatA` im Set der vom Server
    geladenen `userid`s -> Zeilenfehler `benutzer_existiert_bereits`. **Hier wird nichts
    aufgelöst**, auch nicht per Geburtsdatum (DECISIONS „Kollisionsauflösung: Geltungsbereich“).
    Bewusst in Kauf genommen: trifft erst der **gekürzte** Name einen bestehenden User, lautet
    die Meldung ebenfalls `benutzer_existiert_bereits` — zu einer Server-`userid` gibt es keine
    Identitätsinformation, mit der sich der Fall unterscheiden ließe.
14. **Kollision innerhalb der Importdatei** — der **einzige** Fall, in dem das Suffix greift.
    Der Lauf führt eine Registry `vergeben: Map<finalName.toLowerCase(), identitaet>` mit
    `identitaet = normVorname + '|' + normNachname + '|' + ddmmyyyy`. Teilschritte:
    - **14a** `kandidatA` frei -> `kandidat = kandidatA`, Status `neu`.
    - **14b** `kandidatA` belegt von Zeile R **mit gleicher `identitaet`** ->
      `benutzer_existiert_bereits` (DECISIONS „Kollision auch mit Geburtsdatum nicht
      auflösbar“). Gleicher normalisierter Name *und* gleiches Geburtsdatum heißt: das Suffix
      wäre identisch und kann nichts unterscheiden. Kein Zählersuffix. Dieser Fall sind
      unterschiedliche Schreibweisen derselben Person (`Anna Maria` / `AnnaMaria`), die Stufe 9
      absichtlich durchlässt.
    - **14c** `kandidatA` belegt, `identitaet` **verschieden** -> `suffix = '.' + ddmmyyyy` an
      die **gewählte** Reihenfolge anhängen (DECISIONS „Kollisionssuffix und
      Reihenfolge-Schalter“) und **Stufe 12 erneut** mit diesem `suffix` ausführen (nur der
      Nachname schrumpft weiter, das Suffix bleibt unangetastet). `passt: false` ->
      `username_zu_lang`. Ergebnis ist `kandidatB`.
    - **14d** `kandidatB` steht im Set der bestehenden Nextcloud-User ->
      `benutzer_existiert_bereits`.
    - **14e** `kandidatB` in der Datei frei -> Status `kollision_aufgeloest`.
    - **14f** `kandidatB` in der Datei belegt von Zeile S:
      - `identitaet` gleich -> `benutzer_existiert_bereits` (wie 14b, nur eine Ebene später).
      - `identitaet` verschieden -> `username_nach_kuerzung_nicht_eindeutig`
        (DECISIONS „Fehler-ID bei nach Kürzung ununterscheidbaren Namen“). **Nicht** als
        `benutzer_existiert_bereits` melden. *Beweis, dass hier zwingend gekürzt wurde:*
        gleiche `kandidatB` bedeutet gleiches Suffix (also gleiches Geburtsdatum) und gleiches
        `first.trunc(second)`. Ohne Kürzung wären damit auch die normalisierten Komponenten
        gleich und die `identitaet` identisch — Widerspruch.
15. **Validierung des finalen Strings** — erst jetzt, nach Kürzung *und* nach Suffix
    (DECISIONS „Reihenfolge der Validierung im Importpipeline“): reservierte Namen aus
    RESEARCH-OCS §7 -> `username_reserviert`; zusätzlich defensiv Zeichensatz `[a-z0-9.]`,
    nicht nur Punkte, Länge `<= MAX_USERID` über denselben Validator, den auch die manuell
    eingegebene `userid` benutzt (§6.2). Vorher wäre die Prüfung wertlos: Kürzung und Suffix
    verändern den String noch. Reserviert ist erreichbar (`Owncloud`/`Log` -> `owncloud.log`),
    ein Zeichensatzverstoß ist es nicht — siehe Fehlertabelle.
16. `displayname = "${Vorname} ${Nachname}"` in Originalschreibweise
    (DECISIONS „Anzeigename-Format importierter User“). `email` bleibt leer
    (DECISIONS „Wird beim CSV-Import eine E-Mail gesetzt?“).
17. Initialpasswort `` `${prefix}${ddmmyyyy}!` `` (DECISIONS „Wie wird das Initialpasswort
    gebildet?“ / „`<Sonderzeichen>` im Initialpasswort“). Prefix: Pflicht, 3-20 Zeichen,
    `[A-Za-z0-9]`, erster Buchstabe groß (DECISIONS „Prefix-Validierung Initialpasswort“);
    Ergebnis lokal auf ≥ 10 Zeichen prüfen.
18. **Registrieren.** Nur eine Zeile, die Stufe 15 bestanden hat, trägt
    `finalName.toLowerCase() -> identitaet` in die Registry der Stufe 14 ein. Fehlerzeilen
    registrieren nichts und belegen damit keinen Namen für Folgezeilen.

**Folge der Stufe 13 — der saubere Re-Import ist beweisbar:** Ein zweiter Lauf derselben Datei
findet jeden Namen aus dem ersten Lauf im Server-Set und endet für **jede Zeile, die im ersten
Lauf tatsächlich angelegt wurde**, mit `benutzer_existiert_bereits`. Zeilen, die schon vor
Stufe 13 scheitern (`datum_format`, `vorname_leer`, …), scheitern erneut mit **ihrer eigenen**
Fehler-ID — das ist korrekt und kein Widerspruch zum Beweis. Es entsteht nie ein `.ddmmyyyy`-Zweitaccount, weil das Suffix
bestehende User gar nicht mehr betrachtet. **Preis** (bewusst akzeptiert, siehe DECISIONS):
ein echter Neuzugang, der denselben erzeugten Namen wie ein Altuser hätte, muss manuell mit
abweichender `userid` angelegt werden.

### 6.1 Die vier Fälle, die der Coder abdecken muss

Jeder Fall ist ein Pflichttest in `tests/importPlan.test.js`. `max = 20` in den Beispielen,
damit die Kürzung sichtbar bleibt; produktiv ist `MAX_USERID = 64`.

1. **Zwei Namen, die zum gleichen String kürzen** (`givenFirst`, alle drei Zeilen Geburtsdatum
   `02.02.2011`, Budget für den Nachnamen = `20 - 3 - 1 = 16`):

   | # | Vorname | Nachname | kandidatA | Ergebnis |
   |---|---|---|---|---|
   | 1 | `Ann` | `Bergmannschneider` | `ann.bergmannschneide` (gekürzt) | `neu` + `gekuerzt` |
   | 2 | `Ann` | `Bergmannschneiderhuber` | `ann.bergmannschneide` -> belegt, `identitaet` ≠ -> Suffix, Budget `20-3-1-9 = 7` -> `ann.bergman.02022011` | `kollision_aufgeloest` + `gekuerzt` |
   | 3 | `Ann` | `Bergmannschneidermeier` | kandidatA belegt -> Suffix -> `ann.bergman.02022011` **schon von Zeile 2 vergeben**, `identitaet` ≠ | `username_nach_kuerzung_nicht_eindeutig` |

   Zeile 3 ist der Kern: drei verschiedene Nachnamen, die erst durch die Kürzung
   ununterscheidbar werden. Der Test prüft die **Fehler-ID**, nicht nur „ist ein Fehler“.
2. **Kürzung plus Datei-Kollision.** Zeile 2 der Tabelle oben, isoliert getestet: das Suffix
   `.02022011` ist **vollständig** erhalten, gekürzt wurde ausschließlich die
   Nachnamen-Komponente, und der finale String ist genau `max` Zeichen lang. Bei
   `surnameFirst` dasselbe mit `bergman.ann.02022011` — der Test läuft über **beide**
   Reihenfolgen, weil nur so belegt ist, dass nicht am Gesamtstring gekürzt wird.
3. **Re-Import derselben Datei.** Lauf 1 gegen ein leeres Server-Set: Status wie in der Tabelle.
   Lauf 2 mit genau den in Lauf 1 erzeugten Namen als Server-Set: **jede** Zeile
   `benutzer_existiert_bereits` schon in Stufe 13, kein einziger `kollision_aufgeloest`,
   kein neuer Name mit `.ddmmyyyy`, `summary.ok === 0`.
4. **Nachname, der nicht genug gekürzt werden kann.** Vorname so lang, dass
   `max - first.length - 1 - suffix.length < 1`, z. B. `first` = 19 Zeichen bei `max = 20`.
   Ohne Suffix -> `username_zu_lang` direkt in Stufe 12. Mit Suffix (also nach einer
   Datei-Kollision) -> ebenfalls `username_zu_lang`, gemeldet aus Stufe 14c. Der Nachname wird
   **nie** auf 0 Zeichen gekürzt, und es wird **nie** der Vorname beschnitten.

Vorschauzeilen-Status (fixe Liste): `neu`, `kollision_aufgeloest`, `fehler`.
Zusatz-Flag: `gekuerzt` (kombinierbar mit `neu` und `kollision_aufgeloest`).
Die Vorschautabelle zeigt Zeilennummer, Name, Geburtsdatum, erzeugten Username, Status und
bei `fehler` den deutschen Text der Fehler-ID.

### 6.2 Validator für manuell eingegebene `userid`

`username.js` exportiert `validateUserid(s, { quelle })` -> `{ ok, messageId? }`. Geprüft werden
reservierte Namen, `MAX_USERID`, nicht leer, nicht nur Punkte — identisch zu Stufe 15.

**Abweichend ist nur der Zeichensatz**, und das ist Absicht (DECISIONS „Zeichensatz für manuell
eingegebene `userid`“):
- `quelle: 'generator'` (Stufe 15): `[a-z0-9.]` — der Generator erzeugt per Konstruktion nichts
  anderes, die Prüfung ist eine Regressionssperre.
- `quelle: 'manuell'` (§6.2): `[A-Za-z0-9_.@-]`, keine Leerzeichen, kein Apostroph. Nextcloud
  erlaubt laut RESEARCH-OCS §7 zusätzlich Leerzeichen und `'`; beide sind hier **bewusst
  ausgeschlossen**, weil sie in URLs, CSV-Exporten und Shell-Kontexten Quoting-Fehler provozieren.
  Ohne diese Erweiterung könnte der Admin kein `max_mueller` anlegen, obwohl Nextcloud es
  akzeptiert. Die Einzel-User-Anlage in `UsersView.vue` ruft
**denselben** Validator und schickt bei `ok: false` **keinen** Request. Nur hier ist
`username_zeichen` erreichbar, weil der Nutzer frei tippt.

Zeilen- und Dateifehler des **Imports**, abschließende Enumeration mit UI-Text aus
`shared/messages.js`:

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
| `username_leer` | Bitte einen Benutzernamen eingeben. |
| `username_nur_punkte` | Ein Benutzername darf nicht nur aus Punkten bestehen. |
| `username_zeichen` | Der Benutzername enthält nicht erlaubte Zeichen. |
| `username_nach_kuerzung_nicht_eindeutig` | Zwei verschiedene Namen werden durch das Kürzen zum gleichen Username. Bitte einen der beiden manuell anlegen. |
| `benutzer_existiert_bereits` | Benutzer existiert bereits. |

`username_zeichen` steht **nicht** in dieser Liste: die Generatorausgabe besteht per
Konstruktion nur aus `[a-z0-9.]` (Whitelist-Strip in RESEARCH-UPN §1 Schritt 8), und reine
Punkt-Komponenten fängt Stufe 10 ab. Die ID existiert nur für manuell eingegebene `userid`s
(§6.2); eine Importzeile kann sie nicht erzeugen. `username_reserviert` bleibt dagegen
erreichbar.

`benutzer_existiert_bereits` deckt **drei** Wege ab und braucht deshalb eine neutrale Meldung:
Kollision mit einem bestehenden Nextcloud-User (Stufe 13 und 14d) und gleiche `identitaet`
innerhalb der Datei (Stufe 14b und 14f). Die Vorschauzeile nennt zusätzlich den belegten
Username, damit der Admin den Fall unterscheiden kann.

Zielgruppen im Import-Dialog: nur vom Server gelesene Gruppen (`groups.list` muss vor dem
Öffnen der Ansicht geladen sein), plus ausdrückliche Aktion "Gruppe neu anlegen" vor dem Lauf
(DECISIONS „Zielgruppen beim Import“ / „CSV-Import mit nicht existierender Zielgruppe“): die
Vorschau markiert „wird neu angelegt“, swal2 fragt **einmal** explizit nach, danach legt
`groups.create` die Gruppe **vor** dem Importlauf an. So kann OCS `104` nicht mitten im Import
auftreten.
Das Geburtsdatum erscheint in der Vorschau und im Export, sonst nirgends; es wird nicht geloggt.
Die Passwortliste wird beim Verlassen der Importansicht aus `state.js` entfernt.

## 7. OCS-Client

`request({ method, path, query, form })` in `ocs/client.js`:
- Basis `${baseUrl}/ocs/v1.php` + `path`; `format=json` immer in der Query.
- Header auf **jedem** Request: `OCS-APIRequest: true`, `Accept: application/json`,
  `Authorization: Basic base64(user:appPassword)`. Credentials werden dem Client bei der
  Erzeugung **injiziert** (`createOcsClient({ baseUrl, adminUser, appPassword, timeoutMs,
  retryDelaysMs, sleep, fetchImpl })`); `session.js` hält die **Client-Instanz**, nicht der Client
  die Session (DECISIONS „Credential-Übergabe an den OCS-Client"). `sleep`, `retryDelaysMs` und
  `fetchImpl` sind injizierbar, damit Retry-Tests nicht in Echtzeit warten.
  Credentials werden nie in ein Result, ein Log oder eine Exception geschrieben.
- Body als `application/x-www-form-urlencoded`; Arrays als `groups[]`.
- Timeout 20 s über `AbortSignal.timeout` (betrifft nur den einzelnen Request, nicht den Job).
- Envelope-Unwrap: `json.ocs.meta.statuscode` und `json.ocs.data`. Erfolg nur wenn
  HTTP 2xx **und** `statuscode === 100` (REVIEW-NOTES 2).

Result-Typ überall identisch:

```js
{ ok: true, data, httpStatus, versuche }
{ ok: false, kind: 'ocs'|'http'|'auth'|'forbidden'|'ratelimit'|'notOcs'|'network'|'timeout'|'cert',
  httpStatus: number|null, ocsCode: number|null, messageId, message, versuche }
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
   ("Einzelabfragen, kann dauern", DECISIONS „Größenordnung der Zielinstanz“).
4. Das Ergebnis der Probe wird **für die Sitzung memoisiert** (`session.userListMode`
   = `'details' | 'fallback'`) und erst bei Reconnect neu bestimmt.

**Gleichheit der beiden Lesewege — genau abgegrenzt**
(DECISIONS „Gleichheit der beiden Leseweg-Ergebnisse“): beide Wege laufen durch
`shared/userView.js` und liefern `UserView`-Objekte, die in den **Identitätsfeldern**
`userid`, `displayname`, `email`, `enabled`, `groups` übereinstimmen. Mehr wird **nicht**
behauptet. **An der Test-Instanz degradiert `quota` faktisch NICHT** — beide Wege liefern ein
Quota-Objekt (RESEARCH-OCS V2, verifiziert 2026-10-06). Die Erlaubnis zur Degradation auf
`kind: 'unknown'` bleibt im Vertrag, weil die Doku den Skalar-Fall für ältere Versionen zeigt. Sichtbare Folge: die
Dashboard-Kachelzahl „unbekannt“ steigt im Fallback-Modus, `summeBegrenztBytes` sinkt
entsprechend, und betroffene User fallen aus der „fast voll“-Liste. Die Fallback-Warnung im UI
nennt das ausdrücklich. `userView.test.js` prüft genau diese Abgrenzung: Identitätsfelder
gleich, Quota darf abweichen.

**Gruppenmitglieder:** kein Endpunkt, kein Shape-Parsing. Mitglieder und `memberCount` werden
im Renderer aus `UserView.groups` abgeleitet (§3, §4).

**Verbindungsprüfung** (`ocs/connection.js`, aufgerufen aus `connection.connect` und
`connection.connectSaved`): `GET /cloud/users?limit=1&format=json`.
Erfolg = HTTP 200 **und** `statuscode === 100`. Klassifikation mit eigenen Meldungen:
401 -> `falsche_zugangsdaten`; 403 oder OCS 997 -> `kein_admin`; 429 ->
`server_blockt_vorerst` ("Server blockt vorübergehend, bitte warten" — nie als
"nicht erreichbar" oder "falsches Passwort"); `notOcs` -> `falscher_basispfad`;
`ENOTFOUND`/`ECONNREFUSED` -> `server_nicht_erreichbar`; Zertifikatsfehler -> Prompt aus §8.
`shared/url.js` normalisiert vorher: Schema erforderlich, **nur https**
(DECISIONS „TLS / Serverzertifikat“), Trailing Slash und angehängte `/index.php` bzw.
`/ocs/...`-Reste entfernen.
Erst wenn diese Prüfung `100` liefert, schreibt `ipc.js` Credentials und `adminUserId` in die
Session — ein Fehlschlag lässt die Session unverändert.

**Startverhalten:** kein Auto-Connect (DECISIONS „Kein Auto-Connect beim App-Start“). Beim Start
zeigt `ConnectView` die Felder `savedBaseUrl`/`savedAdminUser` aus `connection.status`
vorbefüllt (nie das Passwort) mit Button "Mit gespeichertem Zugang verbinden".
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
  (DECISIONS „Verhalten wenn `safeStorage` `basic_text` meldet“).
  `connection.connect` liefert `{ ok: true, status: { secretStorage: 'session' } }`
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
- **Lebensdauer: nur die laufende Sitzung** — entschieden und nicht mehr offen
  (DECISIONS „Lebensdauer der TLS-Ausnahme (selbstsigniert)“). `session.certException` wird
  nie auf Platte geschrieben, und der Fingerprint muss **nach jedem App-Start erneut
  bestätigt** werden. Ein getauschtes Zertifikat fällt dadurch sofort auf; eine persistierte
  Ausnahme wäre ein stiller Dauer-Bypass. Kosten: ein Klick pro Start.
- Pro Host gilt genau eine Ausnahme; ein zweiter Host erzeugt einen eigenen Prompt.
- `setUsePlainTextEncryption`, `ignore-certificate-errors`, `webSecurity: false` und
  `NODE_TLS_REJECT_UNAUTHORIZED` sind verboten.

## 9. Sicherheitsgrenzen

- **Main -> Renderer:** niemals das App-Passwort, auch nicht maskiert, auch nicht in
  `message`/`stack`. Kein Rohobjekt eines `fetch`-Requests, keine `Authorization`-Header.
- **Renderer:** kein Node, kein `fs`, kein `fetch` auf den Nextcloud-Host, kein `require`.
  `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`,
  `preload` die einzige Brücke. `setWindowOpenHandler` verweigert alles,
  `will-navigate` blockt externe Navigation.
- **Verifikation der Flags:** Das Optionsobjekt liegt in **`src/main/windowOptions.js`** als
  `BROWSER_WINDOW_OPTIONS`; `src/main/index.js` re-exportiert es und übergibt genau dieses an
  `new BrowserWindow(...)`. `applyNavigationGuards(webContents)` liegt ebenfalls in `windowOptions.js` und ist damit ohne
  Electron testbar (`tests/mainWindow.test.js` prüft Deny-All und `will-navigate`).
  `tests/mainWindow.test.js` importiert **`windowOptions.js` direkt** —
  dadurch **kein `electron`-Mock** und keine Bootstrap-Seiteneffekte beim Import. Der Test behauptet
  `contextIsolation === true`, `sandbox === true`, `nodeIntegration === false`,
  `webSecurity !== false` sowie dass `preload` auf `index.cjs` zeigt
  (DECISIONS „Verifikation der Electron-Security-Flags“). Damit regressiert kein Flag still.
- **Content-Security-Policy:** `src/renderer/index.html` tragt ein `<meta http-equiv="Content-Security-Policy">`
  mit `default-src 'self'; style-src 'self' 'unsafe-inline'`. `'unsafe-inline'` ist ausschliesslich
  fuer die Inline-Styles von SweetAlert2 noetig. Der HMR-Websocket im Dev-Modus ist ueber den
  `connect-src`-Fallback auf `'self'` gedeckt. Folgeschritte duerfen die CSP nicht aufweichen,
  ohne es hier zu begruenden (DECISIONS „Content-Security-Policy im Renderer").
- **Preload:** nur die Methoden aus §3, jede mit festem Kanalnamen, CommonJS
  (`src/preload/index.cjs`, weil `sandbox: true` kein ESM-Preload lädt). Keine
  Channel-Parameter von außen, keine Weitergabe von `ipcRenderer`.
- **Platte:** `credentials.json` (verschlüsselt) ist die einzige von der App geschriebene Datei
  ohne Nutzerdialog. CSV-Exporte nur über `dialog.showSaveDialog` an nutzergewählte Pfade.
- **Initialpasswörter:** entstehen pur im Renderer, gehen als Request-Payload nach Main und
  stehen nur im Import-Export. Nicht in Logs, nicht in `ItemResult.grund`, nicht im Jobverlauf.
- **Jobverlauf:** nur Typ, Zeit und die vier Zähler aus `summary`
  (DECISIONS „Dashboard Batch-Job-Historie“) — keine Usernamen-Listen, keine Passwörter,
  keine Persistenz, keine Dry-Runs (DECISIONS „Dry-Runs in der Job-Historie“).

## 10. Fehlerbehandlung und Logging

- `ocs/client.js` wirft nicht; alles wird Result. Netzwerk- und Parse-Fehler werden dort
  in `kind` übersetzt.
- Jeder IPC-Handler hat ein `try/catch` als letzte Rettung und liefert
  `{ ok: false, messageId: 'unerwarteter_fehler', message }` ohne Stack an den Renderer.
- Deutsche Texte ausschließlich in `shared/messages.js` (`messageId -> Text`), damit UI-Sprache
  und Codebezeichner getrennt bleiben. Der Renderer zeigt `message`, loggt nichts.
- Einzelfehler brechen einen Job nie ab (GOAL „Abnahme“). Der Job endet nur durch Abbruch
  durch den Nutzer oder vollständige Abarbeitung — auch erschöpfte 429-Retries beenden ihn nicht.
- Jede Liste hat drei definierte Zustände über `StateBlock.vue`: Laden, Leer
  ("Keine Einträge"), Fehler mit Wiederholen-Button. Nullwerte rendern als "0".
  Datenstand mit Zeitstempel, Aktualisieren nur per Button, kein Polling.
- **Logging:** kein Datei-Logging (DECISIONS „Logging“). `main/log.js#dbg()` ist no-op wenn
  `app.isPackaged`, nimmt nur Strings und wird nie mit Credentials, Passwörtern oder
  Exportinhalten aufgerufen. `process.on('unhandledRejection')` schreibt eine Kurzmeldung
  über `dbg`.

## 11. Teststrategie

**Pur unit-getestet, ohne Mocks** (alles in `src/shared/`): `username`, `birthdate`, `password`,
`csvImport` (beide Exporte), `importPlan`, `quota`, `pool`, `dryRun`, `resultCsv`, `filters`,
`dashboard`, `userView`, `messages`, `url`. Diese Module importieren nichts mit I/O — das ist
eine Review-Regel, nicht nur eine Konvention. **Jedes hier genannte Modul hat genau eine
Testdatei in der §2-Liste**; es gibt keinen Namen hier ohne Datei dort und umgekehrt.

Pflichtfälle:
- alle 14 Zeilen aus RESEARCH-UPN §11 inklusive der beiden `''`-Fehlerfälle, die 5 Fixtures aus
  §10 (ohne Domain), beide Reihenfolgen;
- `truncateToFit` mit Budget `>= second.length`, `>= 1` und `< 1`; die Funktion nimmt kein
  `order` — geprüft wird stattdessen die **Reihenfolgeunabhängigkeit** (gleiche Längen, beide
  `order` beim Zusammensetzen, gleiches `second`-Ergebnis) sowie die Invariante
  `first.length + 1 + second.length + suffix.length <= max` (nur auf dem `passt: true`-Pfad;
  bei `passt: false` kommt `second` unverändert zurück). `gekuerzt: true` impliziert `=== max`,
  **nicht umgekehrt**: am Grenzwert `budget === second.length` gilt `=== max` bei
  `gekuerzt: false`. Dieser Grenzwert ist Pflichttest;
- die **vier Fälle aus §6.1**, jeweils gegen die konkrete Fehler-ID geprüft, insbesondere
  `username_nach_kuerzung_nicht_eindeutig` ≠ `benutzer_existiert_bereits`;
- Re-Import derselben CSV ergibt für **jede** Zeile `benutzer_existiert_bereits` (§6.1 Fall 3);
- jeder Datei- und Zeilenfehler aus der Enumeration in §6 genau einmal;
- alle sechs Quota-Shapes, die fünf `quotaStufe`-Ergebnisse, `istFastVoll` an den Grenzen
  90/90,1 %, `fastVollListe` mit 25 Treffern (Kappung bei 20, `weitere === 5`);
- `storageTotals` mit gemischten Shapes; `historyCounts` mit `teilweise > 0`;
- `validateUserid` mit `müller!`, `...`, `''`, `.htaccess`, 65 Zeichen;
- `userView`: beide Lesewege, Identitätsfelder gleich, Quota-Degradation erlaubt (§7).

**Mit gemocktem `fetch`** (`globalThis.fetch` per `vi.stubGlobal`, keine HTTP-Bibliothek):
`ocs/client.js` (Header-Pflicht `OCS-APIRequest`, `format=json`, 100/401/403/429/HTML/Netzfehler,
Retry-Zählung), `ocs/users.js` und `ocs/groups.js` (endpunktspezifische Codes -> messageId,
`user.update` als ein bzw. zwei Requests), `ocs/userList.js` (Probe-Erfolg, 404-Fallback,
Shape-Fallback, Session-Memo), `actions/pipeline.js` (50 Items, 7 Fehler, ein 429 mit Retry,
Abbruch bei Item 20 -> jedes Item genau einmal, 429 nach erschöpften Retries als
`server_blockt_vorerst`-Item-Fehler **ohne** Jobabbruch, `teilweise` bei fehlgeschlagenem
Gruppenschritt, `shouldStop` als injizierter Callback). Das Aufräumen des Stop-Flags und die
`actions.stop`-Zustände liegen in `session.test.js`, nicht hier.

**Gemockt statt echt:** `electron` (`app`, `dialog`, `safeStorage`, `ipcMain`, `BrowserWindow`)
über Modul-Mocks; `node:fs/promises` in `credentials.test.js`.

**Nur manuell prüfbar** (-> `docs/MANUAL-TEST.md`): echter `users/details`-Pfad und Shape,
echte `MAX_USERID_LENGTH`, safeStorage-Backends, Zertifikatsausnahme, Dialogverhalten von
SweetAlert2, Build-Artefakt, Parallelität am echten Server.

Keine Vue-Komponententests, keine E2E-Suite: GOAL „Abnahme“ verlangt manuelle Abnahme und
ausdrücklich nur Generator- und Batch-Unit-Tests (DECISIONS „Abnahme gegen echte Nextcloud“).

`tests/fixtures/`:
`import-ok.csv` · `import-semikolon.csv` · `import-komma.csv` · `import-bom-crlf.csv` ·
`import-leer.csv` · `import-nur-header.csv` · `import-header-falsch.csv` ·
`import-spaltenzahl.csv` · `import-quote-unbalanciert.csv` · `import-datum-formate.csv` ·
`import-datum-ungueltig.csv` · `import-datum-zukunft.csv` · `import-doppelzeile.csv` ·
`import-cjk.csv` · `import-kollision.csv` · `import-lange-namen.csv` ·
`import-kuerzung-gleich.csv` (die drei Zeilen aus §6.1 Fall 1; **in zwei Varianten**: `-max20` für den Unit-Test mit `max = 20` und `-max64` mit Nachnamen > 60 Zeichen, die ihre ersten 51 Zeichen teilen, für MANUAL #86a gegen die Produktionskonstante `MAX_USERID = 64`) ·
`import-2001-zeilen.csv` · `userliste-mit-header.csv` · `userliste-ohne-header.csv` ·
`ocs-users-details.json` · `ocs-users-ids.json` · `ocs-user-single.json` ·
`ocs-quota-shapes.json` · `ocs-groups.json` · `ocs-error-401.json` ·
`ocs-error-403-997.json` · `ocs-html-antwort.html`
Die Gruppenmitglieder-Fixtures entfallen mit `groups.members` (§3).

## 12. Offene technische Risiken

| Risiko | Gewählte Abfederung |
|---|---|
| `users/details` **verifiziert** (RESEARCH-OCS V1): v1 und v2 funktionieren, Shape identisch | Probe + fünf Fallback-Trigger bleiben als Absicherung gegen andere Versionen. **Ausschließlich `/ocs/v1.php` verwenden** — v2 liefert `statuscode` 200 statt 100 und bricht damit die Envelope-Prüfung |
| `MAX_USERID_LENGTH` **verifiziert 64** (RESEARCH-OCS V5: 65 Zeichen -> `101`) | Konstante `MAX_USERID = 64` an einer Stelle; Kürzungstests übergeben `max` explizit |
| Gruppenmitglieder-Shape **verifiziert** `data.users` = Array (RESEARCH-OCS V4) | Risiko entfällt doppelt: kein Endpunkt mehr, Mitglieder werden aus der Userliste abgeleitet (§3) |
| Quota-Felder inkonsistent / `null` | `kind: 'unknown'` als erster Klasse-Zustand; Dashboard zeigt vier Werte statt einer Summe (DECISIONS „Dashboard-Kachel Speicher“) |
| 429 durch Tippfehler beim Verbinden | Eigene Meldung `server_blockt_vorerst`, kein automatischer Wiederholungsversuch im Verbindungsdialog |
| Brute-Force-Sperre durch Batch-Last | Parallelität fest 4, 429-Backoff 2 s/6 s, danach Item-Fehler |
| safeStorage still auf Klartext | Backendprüfung vor jedem Speichern, `basic_text` persistiert nie, sichtbarer Sitzungshinweis |
| Klartextpasswörter im Export | Warnung vor dem Speicherdialog, nutzergewählter Pfad, Liste beim Verlassen der Ansicht verworfen |
| Kollisionsname kodiert das Geburtsdatum | Geburtsdatum nur in Vorschau und Export sichtbar, nirgends sonst, nie geloggt; Suffix entsteht nur bei Datei-Kollisionen, also selten |
| Re-Import erzeugt Dubletten | Suffix löst **nur** dateiinterne Kollisionen; jede Kollision mit einem bestehenden User ist ein Zeilenfehler (§6 Stufe 13), Pflichttest §6.1 Fall 3 |
| Kürzung macht verschiedene Namen gleich | Eigene Fehler-ID `username_nach_kuerzung_nicht_eindeutig` statt stiller Verschmelzung oder falscher „existiert bereits“-Meldung |
| Teilerfolg bei `user.create` mit Gruppe und bei `user.update` mit zwei Feldern | Getrennte Schritte, Status `teilweise` mit benanntem Schritt, kein Rollback; `summary.teilweise` zählt sie sichtbar |
| Groß-/Kleinschreibung bei User-IDs | Jede Existenz- und Kollisionsprüfung vergleicht case-insensitiv |
| Vorschauzahl weicht von Rohauswahl ab | Löschbestätigung nutzt ausschließlich `aenderungen.length` aus dem Dry-Run |

## 13. Ausdrücklich NICHT gebaut

- Pinia — ein reaktives Modul `state.js` reicht für fünf Views.
- vue-router — eine `ref('dashboard')` plus `<component :is>`; fünf Views, keine URLs, kein Deep-Link-Bedarf.
- axios — Node-`fetch` ist im Main vorhanden.
- papaparse — "simple CSV" ohne Quoting ist ein ~40-Zeilen-Modul.
- electron-store — ein Datensatz, eine JSON-Datei, keine Profile.
- Job-Registry, Queue-Klasse, State Machine, Event-Bus — ein Pool, ein Stop-Flag, eine Ergebnisliste.
- AbortController im Batch — DECISIONS „Abbruch-Semantik im Batch“ verlangt, dass laufende
  Requests fertiglaufen.
- Persistenzschicht für den Jobverlauf — DECISIONS „Dashboard Batch-Job-Historie“: letzte 5 im Speicher.
- Globale OCS-Fehlertabelle — Codes sind endpunktspezifisch (REVIEW-NOTES 3).
- API-Versionsverhandlung / pluggable Adapter — eine Probe mit Session-Memo genügt.
- Batch-Aktion "Einstellungen ändern" / Anzeigename-Umformatierung — gestrichen
  (DECISIONS „Batch-Aktion Einstellungen ändern“).
- Rollback oder Kompensation für Teilfehler — nicht verlässlich erreichbar, Admin lässt erneut laufen.
- Subadmin-Endpunkte, Gruppen-Anzeigename-Editierung, Paginierung, LDAP, Light Theme, i18n — nicht in GOAL.
- Freitext-Kontingent — nur Presets 1/2/5/10/20 GiB und unbegrenzt (DECISIONS „Kontingent-Eingabe“).
- Vue-Komponententests und E2E — Abnahme ist manuell (DECISIONS „Abnahme gegen echte Nextcloud“).
- Auto-Connect beim Start — explizites Verbinden, damit ein abgelehntes Passwort nicht
  unbemerkt die Brute-Force-Verzögerung startet.
- `connection.test` als eigener Kanal — `connect` testet und verbindet in einem Schritt, sonst
  zwei Requests und zwei Fehlerpfade für dieselbe Prüfung.
- `connection.disconnect`, `connection.savedHint`, `groups.members`, `users.list({ refresh })` —
  gestrichen (DECISIONS „IPC-Verschlankung“); kleinere Angriffsfläche, ein Shape-Risiko weniger.
- `adminUserId`/`isAdmin` aus der API — `GET /cloud/user` ist im Research nicht belegt; der
  getippte Loginname genügt für den Selbstschutz (case-insensitiv).
- MB-Grenze beim CSV-Öffnen — die 2000-Zeilen-Grenze deckt dasselbe Problem fachlich ab.
- Separate Module `usernameRules.js` und `csvUserList.js` — in `username.js` bzw. `csvImport.js`
  integriert (DECISIONS „Modulverschlankung“); die Kürzung braucht ohnehin die Generator-Komponenten.
- Zählersuffixe (`...2`, `...3`) bei Kollisionen — nur das Geburtsdatum, und nur dateiintern.
- `electron-vite`, `concurrently`, `wait-on` — `scripts/dev.mjs` mit `node:child_process` genügt.
- ESM-Preload — `sandbox: true` lädt nur CommonJS; deshalb die einzige `.cjs`-Datei.
- Persistierte TLS-Ausnahme — nur Sitzung, Fingerprint nach jedem Start neu bestätigen.
