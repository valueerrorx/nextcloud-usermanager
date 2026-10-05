# Architektur: Nextcloud User Manager

Stand 2026-10-05. Bindend für Coder und Reviewer. Grundlage: `GOAL.md`, `DECISIONS.md`,
`RESEARCH-OCS.md`, `RESEARCH-UPN.md`, `REVIEW-NOTES.md`.

## 1. Überblick

Electron-App mit drei Prozessrollen: Main (alle I/O: HTTP, Dateien, safeStorage), Preload
(schmale, aufgezählte contextBridge-API), Renderer (Vue 3, nur UI + Zustand im Speicher).
Netzwerk, Secrets und Persistenz liegen ausschließlich im Main-Prozess.
Die gesamte Fachlogik ohne I/O (Username-Generierung, CSV, Validierung, Quota-Parsing,
Passwortbildung, Batch-/Import-Pläne, OCS-Fehlertexte) liegt in `src/shared/` und wird
direkt mit Vitest getestet — ohne Electron, ohne HTTP.
Es gibt keinen Router, keinen Store und keine Komponenten-Bibliothek: eine `App.vue` schaltet
zwischen sechs Views, Zustand hält je ein Composable pro Domäne.
Einzige bewusste Abstraktion: `users-list-adapter.js` (Bulk-Details mit Fallback auf
Einzelabfragen, laut DECISIONS.md "Abruf der Userliste").
IPC ist ein fester Vertrag (Abschnitt 4), jeder Aufruf liefert `{ ok, data }` oder
`{ ok: false, error }` — über die IPC-Grenze wird nie geworfen.

## 2. Verzeichnisbaum

```
package.json                     Deps + Scripts dev/test/lint/build, "type": "module"
vite.config.js                   Renderer-Build (root src/renderer, base './', outDir dist/renderer)
vitest.config.js                 Testumgebung node, include tests/**/*.test.js
eslint.config.js                 Flat Config: js + vue, ESM, Node/Browser-Globals getrennt
electron-builder.yml             Linux-Target (AppImage), Dateien dist/ + src/main + src/preload
.gitignore                       node_modules, dist, release, *.log
scripts/dev.js                   startet Vite-Dev-Server und Electron, setzt VITE_DEV_SERVER_URL
docs/                            GOAL, DECISIONS, RESEARCH-*, REVIEW-NOTES, ARCHITECTURE, PLAN

src/main/
  index.js                       app-Lifecycle, BrowserWindow mit Security-Flags, Laden des Renderers
  ipc.js                         einziger Ort mit ipcMain.handle: registriert alle Kanäle aus Abschnitt 4
  session.js                     In-Memory-Verbindung (baseUrl, adminUser, Passwort) für die Laufzeit
  credentials.js                 safeStorage-Prüfung, Verschlüsseln/Entschlüsseln, credentials.json
  store.js                       atomares Lesen/Schreiben der JSON-Dateien in userData
  logger.js                      Level-Logger auf stdout + userData/app.log, mit Redaction
  files.js                       Datei-Dialoge (CSV öffnen/speichern) über dialog + fs
  ocs/client.js                  fetch-Wrapper: Basic Auth, OCS-Header, Envelope-Parsing, 429-Backoff
  ocs/users.js                   User-Endpunkte, jeder mit endpunkt-spezifischem Fehler-Mapping
  ocs/groups.js                  Gruppen-Endpunkte, dito
  ocs/users-list-adapter.js      GET /cloud/users/details mit Fallback auf IDs + Einzelabfragen
  batch/runner.js                Job-Ausführung: Parallelität 5, Fortschritt, Abbruch, Teilfehler
  batch/operations.js            Operation-Typ -> ein API-Call pro User (reine Zuordnung, kein Loop)
  import/service.js              Import-Orchestrierung: Vorschau bauen, User anlegen, Ergebnis liefern

src/shared/                      reine Logik, keine Imports aus electron/node:fs/fetch
  constants.js                   BATCH_CONCURRENCY=5, MAX_USERNAME_LENGTH=64, QUOTA_WARN_RATIO=0.9, u.a.
  username.js                    Normalisierung + Zusammensetzung + Kürzung + Kollisionssuffix
  csv-parse.js                   Delimiter-Erkennung, Zeilen-/Quote-Parsing, Import- und Usernamen-Listen
  csv-export.js                  Zeilen -> CSV-Text (BOM, Quoting), Reportformate für Batch und Import
  validate.js                    Server-URL, Geburtsdatum, E-Mail, Anzeigename, Nextcloud-Usernamen
  quota.js                       defensives Quota-Parsing, Formatierung, Summen, 90-%-Prüfung
  password.js                    Initialpasswort bilden, Mindest-Policy prüfen
  import-plan.js                 CSV-Zeilen + bestehende User -> Vorschauzeilen mit Status
  batch-plan.js                  Dry-Run-Plan, Ergebnis-Aggregation, Bestätigungsregeln
  ocs-errors.js                  je Endpunkt eine Funktion statuscode/HTTP -> deutsche Meldung

src/preload/index.cjs            contextBridge.exposeInMainWorld('api', ...), CJS wegen sandbox:true

src/renderer/
  index.html                     Vite-Entry, CSP-Meta, lädt main.js
  main.js                        createApp(App).mount, importiert theme.css und swal2-CSS
  App.vue                        Layout: Sidebar + aktive View, globaler Verbindungsbanner
  styles/theme.css               Dark-Theme-Variablen, Tabellen-/Formular-/swal2-Overrides
  lib/api.js                     dünner Zugriff auf window.api + Fehler-zu-swal2-Helfer
  lib/confirm.js                 swal2-Presets: confirm, warn, countConfirm, toast (dark)
  lib/format.js                  Anzeige-Formatierung (Bytes, Datum, Prozent) für Templates
  composables/useConnection.js   Verbindungsstatus, Test, Speichern, safeStorage-Warnung
  composables/useUsers.js        Userliste laden, Suche/Filter/Sortierung/Auswahl, Einzel-CRUD
  composables/useGroups.js       Gruppenliste, Mitglieder, Anlegen/Löschen/Zuordnen
  composables/useBatch.js        Dry-Run, Start, Fortschritts-Listener, Abbruch, Report-Export
  composables/useImport.js       CSV wählen, Vorschau, Import starten, Ergebnis-Export
  composables/useDashboard.js    Kennzahlen, "fast voll"-Liste, Job-Historie
  views/ConnectionView.vue       URL/Admin/App-Passwort, "Verbindung testen", Speichern
  views/DashboardView.vue        StatCards, "fast voll"-Tabelle, letzte Batch-Jobs
  views/UsersView.vue            Usertabelle mit Such-/Filterleiste, Mehrfachauswahl, Einzelaktionen
  views/GroupsView.vue           Gruppenliste + Mitgliederpanel
  views/BatchView.vue            Zielauswahl, Operationsformular, Vorschau, Fortschritt, Report
  views/ImportView.vue           CSV-Auswahl, Importoptionen, Vorschautabelle, Ergebnis
  components/NavSidebar.vue      Navigation zwischen den Views + Verbindungsanzeige
  components/StatCard.vue        einzelne Dashboard-Kennzahl
  components/DataTable.vue       generische Tabelle: Spalten, Sortierung, Auswahl-Checkboxen
  components/UserFormDialog.vue  Formular für Anlegen/Bearbeiten eines Users
  components/QuotaField.vue      Quota-Eingabe (Presets + Freitext + "unbegrenzt")
  components/PreviewTable.vue    Dry-Run-/Import-Vorschau mit Statusfarben
  components/ProgressPanel.vue   Fortschrittsbalken, ok/Fehler-Zähler, Abbrechen-Button
  components/ResultReport.vue    Ergebnisliste pro User + CSV-Export-Button

tests/
  username.test.js               Testtabelle aus RESEARCH-UPN Abschnitt 11 + Kürzung + Kollision
  csv-parse.test.js              Delimiter, Quotes, BOM, CRLF, Header-Mapping, Fehlerzeilen
  csv-export.test.js             Quoting, Trennzeichen, Report-Spalten
  validate.test.js               URL-Normalisierung, beide Datumsformate, Nextcloud-Usernamen
  quota.test.js                  "none"/-3/null/fehlend/Skalar/Objekt, Summen, 90-%-Grenze
  password.test.js               Passwortbildung und Policy
  import-plan.test.js            neu/Kollision/gekürzt/Fehler, dateiinterne + serverseitige Kollisionen
  batch-plan.test.js             Plan-Erzeugung, Aggregation inkl. rateLimited, Löschbestätigung
  ocs-errors.test.js             endpunkt-spezifische Codes, HTTP-Fälle, Unbekannt-Fallback
  ocs-client.test.js             fetch gemockt: Header, Envelope, meta.statuscode, 429-Backoff
  ocs-users.test.js              fetch gemockt: Parameter, Rückgabe-Shapes, Fehlerpfade
  users-list-adapter.test.js     fetch gemockt: Bulk-Erfolg, Bulk-Fehler -> Fallback, Teilausfall
  batch-runner.test.js           Parallelität, Teilfehler, Abbruch, 429-Reihenfolge (API gemockt)
  credentials.test.js            electron gemockt: basic_text-Warnpfad, Roundtrip, Redaction
  fixtures/
    users-details.json           OCS-Antwort des Details-Endpunkts (inkl. kaputter Quota-Felder)
    users-list.json              OCS-Antwort nur IDs
    user-single.json             Einzeluser mit Skalar-Quota
    groups.json                  Gruppenliste und Mitglieder
    error-102.json               Fehler-Envelope "User existiert schon"
    import-ok.csv                CSV mit `;`, Umlauten, beiden Datumsformaten
    import-broken.csv            CSV mit Fehlerzeilen (fehlende Felder, falsches Datum, CJK-Name)
    usernames.csv                reine Usernamen-Liste für Batch-Zielauswahl
```

### Abhängigkeiten (jede neue mit Begründung)

| Paket | Typ | Begründung |
|---|---|---|
| `electron` | dev | Laufzeit der Desktop-App, von CLAUDE.md vorgegeben |
| `vue` | prod | UI-Framework, von CLAUDE.md vorgegeben |
| `vite`, `@vitejs/plugin-vue` | dev | Renderer-Build und HMR, von CLAUDE.md vorgegeben |
| `sweetalert2` | prod | Dialoge/Bestätigungen, von CLAUDE.md vorgegeben |
| `vitest` | dev | Testrunner, von CLAUDE.md vorgegeben |
| `eslint`, `eslint-plugin-vue` | dev | Lint für JS und Vue-SFCs |
| `electron-builder` | dev | einziger Schritt für `npm run build` zu einer lauffähigen Linux-AppImage |

Keine HTTP-Bibliothek (globales `fetch` in Electron/Node), kein CSV-Paket (eigener Parser,
weil Fehlerzeilen-Toleranz und Header-Mapping ohnehin projektspezifisch sind), kein
State-Manager, kein Router, keine UI-Bibliothek, kein TypeScript.

## 3. Prozessgrenze

**Main** (`src/main/**`, Node-Vollzugriff): Fenster und Lifecycle, alle HTTP-Requests zur
Nextcloud, App-Passwort im Speicher und in safeStorage, alle Dateizugriffe (CSV lesen/schreiben,
JSON in `userData`, Logfile), Batch-Job-Ausführung und -Abbruch, Fehler-Mapping nach Deutsch.

**Preload** (`src/preload/index.cjs`, sandboxed): nichts außer `contextBridge` +
`ipcRenderer.invoke`/`.on` für die in Abschnitt 4 aufgezählten Kanäle. Keine Logik, keine
Schleifen, kein generischer `invoke(channel, args)`. CommonJS-Datei, weil Electron ESM-Preloads
nur mit `sandbox: false` lädt — Sandbox bleibt an, also `.cjs`.

**Renderer** (`src/renderer/**`): Darstellung, Formularzustand, Suche/Filter/Sortierung/Auswahl
auf schon geladenen Listen, swal2-Dialoge, Aufrufe der Preload-API. Darf nicht: Netzwerk,
Dateisystem, `require`, Secrets halten. Importiert aus `src/shared/` nur reine Funktionen
(Formatierung, Validierung für Sofort-Feedback im Formular); die verbindliche Validierung
läuft trotzdem erneut im Main.

`BrowserWindow`-Flags: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
`webSecurity: true`, `preload: src/preload/index.cjs`. `index.html` setzt eine CSP
(`default-src 'self'`; `style-src 'self' 'unsafe-inline'` für swal2; `connect-src 'none'`),
`setWindowOpenHandler` verweigert alle neuen Fenster, `will-navigate` wird blockiert.

## 4. Preload-API (IPC-Vertrag)

Alle Methoden sind `async` und liefern **immer**
`{ ok: true, data }` oder `{ ok: false, error: { kind, message, code } }`.
`kind` ∈ `'validation' | 'auth' | 'network' | 'rate_limit' | 'api' | 'not_connected' | 'unknown'`.
`message` ist immer deutsch und UI-fertig. `code` ist der OCS-Statuscode oder HTTP-Status, falls
vorhanden. Kanalnamen sind `"<namespace>:<method>"` (z. B. `users:list`).

```js
window.api = {
  connection: {
    // {baseUrl, adminUser, appPassword} -> data {serverName, version, backend}
    test(input),
    // speichert nach erfolgreichem Test; acceptPlainText muss true sein, wenn backend 'basic_text'
    save({ baseUrl, adminUser, appPassword, acceptPlainText }),  // data {saved:true, backend}
    // beim App-Start: entschlüsselt und aktiviert die Session, ohne Passwort zurückzugeben
    restore(),            // data {connected, baseUrl, adminUser, backend} | ok:false
    status(),             // data {connected, baseUrl, adminUser, backend, plainTextWarning}
    forget()              // data {cleared:true}
  },

  users: {
    list(),               // data {users:[UserRow], source:'details'|'fallback', partial:[{id,reason}]}
    get(userId),          // data UserRow
    create({ userId, password, displayName, email, quota, groups }),  // data {userId}
    update(userId, { displayName, email, quota }),  // data {applied:[key], failed:[{key,message}]}
    setPassword(userId, password),                  // data {userId}
    setEnabled(userId, enabled),                    // data {userId, enabled}
    remove(userId),                                 // data {userId}
    addToGroup(userId, groupId),                    // data {userId, groupId}
    removeFromGroup(userId, groupId)                // data {userId, groupId}
  },

  groups: {
    list(),               // data {groups:[{id, userCount|null}]}
    members(groupId),     // data {groupId, members:[userId]}
    create(groupId),      // data {groupId}
    remove(groupId)       // data {groupId}
  },

  batch: {
    // reiner Dry-Run, kein Schreibzugriff
    preview({ operation, userIds, params }),  // data {changes:[Change], skipped:[Skip], total}
    start({ operation, userIds, params }),    // data {jobId}
    cancel(jobId),                            // data {jobId, cancelling:true}
    // Push-Kanäle; Rückgabe ist die Unsubscribe-Funktion
    onProgress(cb),   // cb({jobId, done, total, ok, failed, rateLimited, currentUserId})
    onFinished(cb)    // cb({jobId, cancelled, summary, results:[BatchResult]})
  },

  importUsers: {
    chooseFile(),                 // data {path, name, text}  (Dialog + Datei lesen im Main)
    preview({ text, order, passwordPrefix, groups, quota }),
                                  // data {rows:[PlanRow], summary:{neu, kollision, gekuerzt, fehler}}
    start({ rows, groups, quota }),  // data {jobId}  (Fortschritt über batch.onProgress/onFinished)
    exportResult({ rows, defaultName })  // data {path} | ok:false kind 'validation' bei Abbruch
  },

  reports: {
    exportBatchResult({ jobId, results, defaultName })  // data {path}
  },

  jobs: {
    history()   // data {jobs:[{id, type, startedAt, finishedAt, total, ok, failed, rateLimited, cancelled}]}
  },

  settings: {
    get(),                    // data {usernameOrder, usersPageSize}
    set(partialSettings)      // data Settings
  }
}
```

Shapes:

```
UserRow      { id, displayName, email, enabled, groups:[string], quota: QuotaInfo }
QuotaInfo    { unlimited:bool, known:bool, totalBytes:number|null, usedBytes:number|null,
               relative:number|null, raw }
Change       { userId, operation, from, to, note }           // Dry-Run-Zeile
Skip         { userId, reason }                              // z. B. "bereits deaktiviert"
BatchResult  { userId, status:'ok'|'error'|'rate_limited'|'skipped'|'cancelled', message }
PlanRow      { line, firstName, lastName, birthDate, displayName, username, password,
               status:'new'|'collision_resolved'|'truncated'|'error', reason }
```

Das App-Passwort kommt nur in `connection.test`/`connection.save` **hinein** und niemals heraus.
Initialpasswörter verlassen den Main nur in den `importUsers.preview`/`start`-Shapes und im
Ergebnis-CSV — nie im Log, nie in der Job-Historie.

## 5. Modulverantwortlichkeiten

### 5.1 `src/shared/` (reine Logik, unit-getestet)

`constants.js`
```js
export const BATCH_CONCURRENCY = 5;         // DECISIONS: fix, nicht konfigurierbar
export const MAX_USERNAME_LENGTH = 64;      // RESEARCH-OCS 7: UNVERIFIZIERT, defensiv
export const QUOTA_WARN_RATIO = 0.9;        // GOAL: "fast voll"
export const JOB_HISTORY_LIMIT = 20;
export const RESERVED_USERNAMES = [...];    // RESEARCH-OCS 7
export const USERNAME_ALLOWED = /^[a-zA-Z0-9 _.@'-]+$/;
export const RATE_LIMIT_BACKOFF_MS = [1000, 4000, 10000];
```

`username.js` — 1:1-Port laut RESEARCH-UPN 1-3.
```js
normalizeNameComponent(text): string            // Schritte 1-8, Reihenfolge bindend
normalizeUsernameOrder(value): 'givenFirst'|'surnameFirst'
buildUsername(firstName, lastName, order): string      // '' wenn eine Komponente leer
truncateUsername(name, maxLength = MAX_USERNAME_LENGTH): { username, truncated }
collisionUsername(base, ddmmyyyy, maxLength = MAX_USERNAME_LENGTH): { username, truncated }
isReservedUsername(name): boolean
normalizeForComparison(name): string            // toLowerCase, für Kollisionsvergleich
```
Kürzung + Kollision: `collisionUsername` kürzt den **Basisteil** so, dass
`base + '.' + ddmmyyyy` die Maximallänge hält; die Kollisionsprüfung läuft immer auf dem
endgültigen (gekürzten) Wert.

`csv-parse.js`
```js
detectDelimiter(text): ';' | ','
parseCsv(text, delimiter): { header: string[], rows: string[][] }   // BOM, CRLF, ""-Quoting
parseImportCsv(text): { rows: [{line, firstName, lastName, birthDateRaw}], errors: [{line, reason}] }
parseUsernameList(text): { usernames: string[], errors: [{line, reason}] }
```
Header-Mapping case- und whitespace-insensitiv auf `vorname`, `nachname`, `geburtsdatum`;
fehlende Pflichtspalte ist ein Dateifehler, fehlender Zellwert ein Zeilenfehler.

`validate.js`
```js
validateServerUrl(raw): { ok, baseUrl } | { ok:false, reason }   // https erzwingen, Pfad abschneiden
parseBirthDate(raw): { ok, iso, ddmmyyyy } | { ok:false, reason } // 'dd.mm.yyyy' | 'yyyy-mm-dd'
validateEmail(raw): { ok } | { ok:false, reason }
validateDisplayName(raw): { ok, value } | { ok:false, reason }
validateNextcloudUsername(name): { ok } | { ok:false, reason }    // Zeichen, Länge, reserviert, nur Punkte
validateGroupId(raw): { ok, value } | { ok:false, reason }
```

`quota.js` — defensiv, siehe Abschnitt 8.
```js
parseQuotaField(raw): QuotaInfo        // Skalar | Objekt | 'none' | -3 | null | undefined
parseQuotaInput(text): { ok, apiValue } | { ok:false, reason }   // '5 GB', '1024', 'unbegrenzt' -> 'none'
formatBytes(bytes): string                                        // '1,5 GB', '—' bei null
formatQuota(info): string
isNearlyFull(info, ratio = QUOTA_WARN_RATIO): boolean             // false wenn unknown/unlimited
sumQuotas(infos): { usedBytes, quotaBytes, unlimitedCount, unknownCount }
```

`password.js`
```js
buildInitialPassword(prefix, ddmmyyyy, suffix = '!'): string      // '<Prefix><ddmmyyyy><Suffix>'
validatePasswordPolicy(pw): { ok } | { ok:false, reason }         // min. 10 Zeichen
validatePasswordPrefix(prefix): { ok } | { ok:false, reason }     // nicht leer, ASCII
```

`import-plan.js`
```js
buildImportPlan({ rows, existingUsernames, order, passwordPrefix, passwordSuffix }): {
  rows: PlanRow[], summary: { neu, kollision, gekuerzt, fehler }
}
```
Reihenfolge je Zeile: Datum parsen -> Username bauen -> kürzen -> gegen bestehende **und**
bereits geplante Namen case-insensitiv prüfen -> bei Kollision Geburtsdatum anhängen -> bei
erneuter Kollision Status `error` mit Grund. Passwort pro Zeile aus `password.js`.
Anzeigename `Vorname Nachname` in Originalschreibweise.

`batch-plan.js`
```js
buildBatchPlan({ operation, users, params }): { changes: Change[], skipped: Skip[] }
requiresCountConfirmation(operation): boolean          // true nur für 'delete'
summarizeBatchResult(results): { total, ok, failed, rateLimited, skipped, cancelled }
```

`ocs-errors.js` — **eine Funktion pro Endpunkt, keine globale Tabelle** (RESEARCH-OCS 5).
```js
createUserError(statuscode, httpStatus, message): AppError
updateUserError(statuscode, httpStatus, message): AppError
userStateError(statuscode, httpStatus, message): AppError     // enable/disable/delete
groupMembershipError(statuscode, httpStatus, message): AppError
createGroupError(statuscode, httpStatus, message): AppError
deleteGroupError(statuscode, httpStatus, message): AppError
readError(statuscode, httpStatus, message): AppError          // GET-Endpunkte
transportError(cause): AppError                               // DNS, TLS, Timeout
// AppError = { kind, code, message }  (message deutsch)
```

`csv-export.js`
```js
toCsv(header, rows, delimiter = ';'): string          // UTF-8 BOM, Quoting bei ; " \n
importResultToCsv(rows): string                       // Zeile;Vorname;Nachname;Username;Initialpasswort;Status;Grund
batchResultToCsv(results): string                     // Username;Status;Meldung
```

### 5.2 `src/main/`

`ocs/client.js` — abhängig von `session.js`, `ocs-errors.js`, `logger.js`.
```js
ocsRequest({ method, path, query, form, mapError }): Promise<{ data, meta }>   // wirft AppError
```
Setzt `Authorization: Basic`, `OCS-APIRequest: true`, `Accept: application/json`,
`?format=json`, `AbortSignal.timeout(30000)`. Prüft **HTTP-Status und `ocs.meta.statuscode`**.
Bei HTTP 429 (oder `Retry-After`): Backoff nach `RATE_LIMIT_BACKOFF_MS`, danach
`kind:'rate_limit'`. Bei 401/403: `kind:'auth'`. Nicht-JSON-Antwort (HTML/Redirect, typisch bei
fehlendem OCS-Header) -> `kind:'api'` mit Hinweistext. `mapError` wird vom Aufrufer übergeben,
damit das Mapping endpunkt-spezifisch bleibt.

`ocs/users.js`, `ocs/groups.js` — eine exportierte Funktion pro Endpunkt aus RESEARCH-OCS 2/3,
jede mit dem passenden `ocs-errors`-Mapper. Keine Schleifen über Nutzer, keine Retries außer dem
429-Backoff des Clients.

`ocs/users-list-adapter.js` — **einzige erlaubte Abstraktion**.
```js
fetchUserRows(): Promise<{ users: UserRow[], source: 'details'|'fallback', partial: [{id,reason}] }>
```
Versucht `GET /cloud/users/details`; bei HTTP 404/400, unerwartetem Shape oder leerer
`users`-Map fällt es auf `GET /cloud/users` + `GET /cloud/users/{id}` mit Parallelität 5 zurück.
Einzelne fehlgeschlagene Detailabfragen landen in `partial` und werden im UI als
"unvollständig" markiert, statt den ganzen Abruf zu verwerfen. Normalisiert in beiden Pfaden
über `quota.parseQuotaField`.

`batch/operations.js`
```js
operationFor(operation): (userId, params) => Promise<void>    // genau ein API-Call pro User
```
Unterstützte `operation`-Werte: `'delete' | 'enable' | 'disable' | 'addToGroup' |
'removeFromGroup' | 'setQuota' | 'createUser'`.

`batch/runner.js`
```js
startJob({ type, items, params, onProgress }): { jobId }
cancelJob(jobId): boolean
```
Worker-Pool mit `BATCH_CONCURRENCY = 5`. Pro Item ein `BatchResult`. `rate_limited`-Items werden
nach Abschluss der übrigen genau einmal wiederholt; bleibt es dabei, zählen sie als
`rateLimited`, nicht als `failed`. `cancelJob` setzt ein Flag: laufende Requests werden
abgewartet, nicht gestartete Items erhalten `status:'cancelled'`. Fortschritt wird gedrosselt
(max. alle 150 ms) per `webContents.send('batch:progress', ...)` gesendet.

`import/service.js`
```js
previewImport({ text, order, passwordPrefix, groups, quota }): Promise<PreviewResult>
runImport({ rows, groups, quota }): Promise<{ jobId }>
```
`previewImport` holt bestehende Usernamen (nur IDs, `GET /cloud/users`), parst die CSV und ruft
`buildImportPlan`. Schlägt der Abruf fehl, wird **abgebrochen** (keine Vorschau ohne
Kollisionsbasis). `runImport` übergibt nur Zeilen mit Status ≠ `error` an `batch/runner.js` mit
`operation:'createUser'`; Gruppen und Quota werden direkt in `POST /cloud/users` mitgegeben.

`credentials.js`
```js
encryptionState(): { available: boolean, backend: string, plainText: boolean }
saveCredentials({ baseUrl, adminUser, appPassword, acceptPlainText }): void   // wirft bei plainText ohne accept
loadCredentials(): { baseUrl, adminUser, appPassword, backend } | null
clearCredentials(): void
```

`session.js`
```js
setSession({ baseUrl, adminUser, appPassword }): void
getSession(): { baseUrl, adminUser, appPassword }    // wirft AppError kind 'not_connected'
publicSession(): { connected, baseUrl, adminUser, backend, plainTextWarning }
clearSession(): void
```

`store.js`
```js
readJson(name, fallback): object       // defekte Datei -> fallback + Warnlog
writeJson(name, value): void           // Schreiben in .tmp + rename
appendJob(entry): void                 // vorne einfügen, auf JOB_HISTORY_LIMIT kürzen
readJobs(): object
readSettings(): object
writeSettings(partial): object
```

`logger.js`
```js
log.info(msg, meta), log.warn(...), log.error(...)
redact(value): value                   // entfernt password/appPassword/Authorization/initialPassword
```

## 6. Datenfluss

### (a) Verbindung testen und Credentials speichern
1. `ConnectionView` validiert die URL lokal über `validate.validateServerUrl` (Sofort-Feedback).
2. `api.connection.test({baseUrl, adminUser, appPassword})` -> `ipc.js`.
3. Main validiert erneut, setzt eine temporäre Session, ruft `GET /cloud/users?limit=1` mit
   OCS-Header; prüft HTTP-Status und `ocs.meta.statuscode`.
4. Fehler -> `{ok:false, error}` mit `kind` `auth`/`network`/`api`/`rate_limit`; Renderer zeigt
   swal2-Fehler. Erfolg -> `{ok:true, data:{backend, ...}}`.
5. Ist `backend === 'basic_text'` oder `isEncryptionAvailable() === false`, zeigt der Renderer
   eine swal2-Warnung mit expliziter Bestätigung und ruft erst dann
   `api.connection.save({..., acceptPlainText:true})` (DECISIONS: warnen + speichern erlauben).
6. Main verschlüsselt das Passwort mit `safeStorage.encryptString`, schreibt `credentials.json`,
   aktiviert die Session. Die Rückgabe enthält **kein** Passwort.
7. Beim nächsten App-Start ruft `App.vue` `api.connection.restore()`; schlägt das Entschlüsseln
   fehl (Keyring gewechselt), wird die Datei verworfen und der Verbindungsdialog gezeigt.

### (b) Batch-Job mit Dry-Run, Fortschritt und Abbruch
1. `UsersView` liefert die Auswahl (IDs) an `BatchView`; alternativ liest
   `api.importUsers.chooseFile` + `csv-parse.parseUsernameList` eine Usernamen-Liste.
2. `api.batch.preview({operation, userIds, params})` -> Main lädt die betroffenen Userzeilen und
   ruft `batch-plan.buildBatchPlan`.
3. `PreviewTable` zeigt `changes` und `skipped`. Bestätigung per swal2; bei
   `operation:'delete'` zusätzlich `countConfirm`: der Admin muss die Anzahl eintippen
   (`batch-plan.requiresCountConfirmation`).
4. `api.batch.start(...)` -> `runner.startJob`, Rückgabe `{jobId}` sofort.
5. `runner` arbeitet mit 5 parallelen Requests und sendet `batch:progress`
   (`done/total/ok/failed/rateLimited`); `ProgressPanel` rendert daraus.
6. `api.batch.cancel(jobId)` setzt das Abbruchflag; restliche Items werden `cancelled`.
7. Am Ende sendet Main `batch:finished` mit `results` + `summary`, schreibt den Metadatensatz per
   `store.appendJob` (max. 20 Jobs, keine Passwörter); `ResultReport` bietet
   `api.reports.exportBatchResult` an -> `csv-export.batchResultToCsv` + Speicherdialog.

### (c) CSV-Import von Datei bis Ergebnis-Export
1. `ImportView` -> `api.importUsers.chooseFile()`: Main öffnet den Dialog, liest die Datei als
   UTF-8 und gibt `{path, name, text}` zurück (Renderer sieht nie das Dateisystem).
2. Admin setzt Reihenfolge (`vorname.nachname` / `nachname.vorname`), Passwort-Prefix,
   optionale Zielgruppen und Quota.
3. `api.importUsers.preview(...)`: Main holt bestehende Usernamen, parst die CSV
   (`parseImportCsv`), baut den Plan (`buildImportPlan`).
4. `PreviewTable` zeigt pro Zeile Status `new` / `collision_resolved` / `truncated` / `error`
   farbig; Fehlerzeilen rot und vom Import ausgeschlossen (DECISIONS: gute Zeilen importieren).
5. swal2-Bestätigung mit Anzahl der anzulegenden User -> `api.importUsers.start({rows, groups, quota})`.
6. Fortschritt und Abschluss laufen über dieselben `batch:progress`/`batch:finished`-Kanäle.
7. `api.importUsers.exportResult({rows, defaultName})`: Main erzeugt `importResultToCsv`
   (inkl. Initialpasswort und Fehlerzeilen mit Grund) und schreibt die Datei über den
   Speicherdialog. Danach wird der Plan im Renderer-Zustand verworfen; die Passwörter existieren
   nur noch in dieser CSV.

## 7. Fehlerbehandlung und Logging

- **Einheitliches Fehlerobjekt** `{ kind, code, message }`. Erzeugt wird es ausschließlich in
  `src/shared/ocs-errors.js` (API-Fehler) oder aus `validate.js`-Ergebnissen (Eingabefehler).
- **Pro Endpunkt gemappt, keine globale Tabelle.** `createUserError` kennt 101-111,
  `updateUserError` kennt 101/107/112/113, `createGroupError` kennt 101-103 usw. Codes, die ein
  Endpunkt laut Research nicht definiert, fallen in einen generischen Text mit angezeigtem Code
  (`"Unerwarteter API-Fehler (Code 113)"`). Die laut Research unbestätigten Codes 996-999 werden
  nicht interpretiert; stattdessen zählt der HTTP-Status (401/403 -> `auth`, 404 -> `api`,
  5xx -> `api` mit Servertext).
- **HTTP 429:** `client.js` wartet nach `RATE_LIMIT_BACKOFF_MS` (1 s, 4 s, 10 s; ein vorhandener
  `Retry-After` schlägt das vor). Danach `kind:'rate_limit'`. Im Batch wird das Item einmal am
  Jobende wiederholt und sonst als `rate_limited` ausgewiesen — eigene Spalte im Report, nicht in
  `failed` gezählt. Der UI-Text nennt den Brute-Force-Schutz als wahrscheinliche Ursache.
- **Teilfehler im Batch:** jedes Item hat ein eigenes `BatchResult`; der Job läuft immer bis zum
  Ende durch (außer bei Abbruch). `summarizeBatchResult` liefert die fünf Zähler, die Historie
  speichert nur diese Zahlen.
- **Mehrfeld-Updates** (`users.update`) sind je Feld ein `PUT`; Teilerfolg wird als
  `{applied, failed}` zurückgegeben, nicht als Gesamtfehler.
- **Logging:** `logger.js` schreibt nach `userData/app.log` (bei >1 MB einmalige Rotation nach
  `app.log.1`) und auf stdout. Geloggt werden Methode, Pfad, HTTP-Status, `meta.statuscode`,
  Dauer, Job-Kennzahlen. `redact()` entfernt vor jeder Ausgabe die Schlüssel `password`,
  `appPassword`, `initialPassword`, `Authorization` sowie das aktuelle Session-Passwort als
  Teilstring. Der Renderer loggt nichts über IPC; unerwartete Renderer-Fehler landen in einem
  swal2-Dialog.
- Unbehandelte Fehler im Main: `process.on('unhandledRejection')` loggt und zeigt einen
  swal2-Fehler im Fenster, beendet die App aber nicht.

## 8. Quota-Modell (defensiv, RESEARCH-OCS 4)

`parseQuotaField(raw)` ist die einzige Stelle, die Quota-Rohdaten interpretiert:

| Rohwert | Ergebnis |
|---|---|
| `"none"`, `-3`, `"-3"` | `{ unlimited:true, known:true, totalBytes:null }` |
| Zahl > 0 (Skalar) | `{ unlimited:false, known:true, totalBytes:n, usedBytes:null, relative:null }` |
| `0` (Skalar) | `{ unlimited:false, known:false, ... }` — 0 ist in Nextcloud ambivalent, nie als "voll" werten |
| Objekt mit `quota` und `used` | Werte einzeln geprüft; `free`/`total` dürfen fehlen oder `null` sein |
| `null`, `undefined`, `""`, NaN, nicht-numerischer String | `{ known:false, unlimited:false, totalBytes:null, usedBytes:null }` |
| `relative` vorhanden und 0-100 | übernommen, sonst aus `used/total` berechnet, sonst `null` |

Konsequenzen: `isNearlyFull` liefert nur `true`, wenn `known && !unlimited && totalBytes > 0` und
`usedBytes/totalBytes >= 0.9`. `sumQuotas` summiert ausschließlich `known && !unlimited`-Werte
und führt `unlimitedCount` und `unknownCount` separat; das Dashboard zeigt diese Zahlen explizit
an ("x User ohne auswertbares Kontingent"), statt sie stillschweigend als 0 zu summieren.
`parseQuotaInput` schreibt beim Setzen `"none"` für unbegrenzt und sonst den normalisierten Text
(`"5 GB"`); Rohbytes werden als Zahl gesendet.

**Annahme (unverifiziert):** `GET /cloud/users/details` liegt unter
`/ocs/v1.php/cloud/users/details` und liefert `data.users` als Map `userId -> Userobjekt`.
Der Adapter prüft diese Form und degradiert bei Abweichung auf den Fallback-Pfad.
**Annahme (unverifiziert):** `MAX_USERID_LENGTH = 64`.
**Annahme (unverifiziert):** `GET /cloud/groups/{groupid}` liefert `data.users` als Array von
IDs; der Leser akzeptiert auch `data.members` und eine Map und normalisiert auf ein Array.

## 9. Persistenz (`app.getPath('userData')`)

```
credentials.json  { version:1, baseUrl, adminUser, passwordCipher:<base64>,
                    backend:'gnome_libsecret'|'kwallet'|'basic_text'|..., savedAt:<ISO> }
jobs.json         { version:1, jobs:[ { id, type, startedAt, finishedAt, total, ok, failed,
                    rateLimited, cancelled } ] }      // max. 20, neueste zuerst
settings.json     { version:1, usernameOrder:'givenFirst'|'surnameFirst', usersPageSize:50,
                    lastCsvDir:<string|null> }
app.log           Textlog, rotiert einmalig nach app.log.1 bei >1 MB
```

`jobs.json` enthält nur Metadaten — keine Usernamen-Listen, keine Passwörter, keine Fehlertexte
mit Nutzerdaten. Alle Schreibzugriffe über `store.js` (tmp + rename). Beim Lesen einer defekten
oder fremdversionierten Datei wird der Fallback genutzt und gewarnt, nie geworfen. CSV-Exporte
schreibt der Nutzer über den Speicherdialog an einen Ort seiner Wahl, nie nach `userData`.

## 10. Teststrategie

**Unit-getestet (Vitest, `tests/`, Umgebung `node`):** alle Module aus `src/shared/` — der
Username-Generator gegen die vollständige Tabelle aus RESEARCH-UPN 11 plus die Fixtures aus
Abschnitt 10 (ohne Domain), Kürzung bei 64 Zeichen, Kollisionsauflösung mit Geburtsdatum,
case-insensitiver Vergleich; CSV-Parser mit beiden Trennzeichen, BOM, CRLF, Quotes, fehlenden
Spalten; beide Datumsformate und deren Fehlerfälle; Quota-Parsing für jede Zeile der Tabelle in
Abschnitt 8; Passwortbildung und Policy; Import-Plan mit datei- und serverseitigen Kollisionen;
Batch-Aggregation inkl. `rateLimited`; alle `ocs-errors`-Funktionen inkl. Unbekannt-Fallback.

**Mit gemocktem HTTP getestet:** `ocs/client.js` (Header `OCS-APIRequest`, `format=json`,
Auswertung von HTTP-Status *und* `meta.statuscode`, 429-Backoff, HTML-Antwort),
`ocs/users.js`/`groups.js` (Parameter und Fehlerpfade), `ocs/users-list-adapter.js`
(Bulk-Erfolg, Bulk-404 -> Fallback, einzelne fehlende Details -> `partial`),
`batch/runner.js` (Parallelität ≤ 5, Teilfehler, Abbruch, 429-Nachlauf).
Mocking: `vi.stubGlobal('fetch', vi.fn())` mit Antworten aus `tests/fixtures/*.json`; keine
Netzwerk-Bibliothek, kein MSW. `electron` wird per `vi.mock('electron', ...)` ersetzt
(`safeStorage`, `app.getPath`, `dialog`), `node:fs` über ein temporäres Verzeichnis.

**Bewusst nicht automatisiert getestet:** Vue-Komponenten und swal2-Dialoge (keine jsdom-/
Testing-Library-Abhängigkeit, Abnahme laut GOAL manuell), `src/main/index.js` und Preload
(Verdrahtung ohne Logik), das `electron-builder`-Artefakt, echte Nextcloud-Instanz (laut
DECISIONS manuelle Abnahme durch den Nutzer).

## 11. Sicherheitsgrenzen

- App-Passwort: nur in `session.js` (Speicher) und verschlüsselt in `credentials.json`. Es wird
  nie in eine IPC-Antwort, ein Log, eine Fehlermeldung, eine Exception oder ein CSV geschrieben,
  auch nicht teilmaskiert. `logger.redact()` ist die zweite Verteidigungslinie.
- Initialpasswörter: existieren im Main (Plan), im Renderer nur als Vorschauzeile und im
  Ergebnis-CSV. Kein Logging, kein Eintrag in `jobs.json`.
- Renderer darf: `window.api`-Methoden aufrufen, Daten darstellen, lokal filtern/sortieren,
  reine Funktionen aus `src/shared/` nutzen.
- Renderer darf nicht: HTTP sprechen (`connect-src 'none'`), Dateien lesen/schreiben, Node-APIs
  nutzen, beliebige IPC-Kanäle adressieren, Secrets halten.
- Jeder IPC-Handler validiert seine Eingaben erneut im Main (Server-URL, Usernamen, Quota,
  Gruppen-IDs) — die Renderer-Validierung ist nur Komfort.
- Externe Links/Navigation sind blockiert; es gibt keinen `webview`, kein `remote`, kein
  `nodeIntegrationInWorker`.

## 12. Explizit NICHT gemacht

- **Kein vue-router:** sechs Views, eine `ref` in `App.vue` genügt.
- **Kein Pinia/Vuex:** je ein Composable pro Domäne deckt den Zustand ab.
- **Keine UI-Bibliothek:** eigenes Dark-Theme-CSS, nur swal2 für Dialoge (CLAUDE.md-Vorgabe).
- **Kein TypeScript:** von CLAUDE.md ausgeschlossen.
- **Kein axios/node-fetch:** globales `fetch` reicht für Basic-Auth-Formularrequests.
- **Keine CSV-Bibliothek:** der Parser muss Fehlerzeilen-Toleranz und Header-Mapping ohnehin
  selbst liefern; rund 60 Zeilen reine Logik statt Abhängigkeit.
- **Keine globale OCS-Fehlertabelle:** laut Research bedeuten Codes pro Endpunkt Verschiedenes.
- **Kein Repository-/Service-Interface über die OCS-Module:** es gibt genau eine
  Implementierung; Ausnahme ist nur der Userlisten-Adapter mit zwei realen Pfaden.
- **Kein Plugin-/Erweiterungssystem, keine Server-Profile, kein LDAP, keine i18n, kein Light
  Theme:** Nicht-Ziele in GOAL.md.
- **Kein Auto-Update, keine Telemetrie, kein Crash-Reporter.**
- **Kein Caching-Layer, keine lokale DB:** Listen werden pro Ansicht geladen und im Composable
  gehalten.
- **Kein konfigurierbares Parallelitäts-Setting:** DECISIONS legt fix 5 fest.
- **Kein Integrationstest gegen eine echte Nextcloud:** DECISIONS legt manuelle Abnahme fest.
- **Kein eigener Bundler für Main/Preload:** Electron lädt die ESM-Main-Dateien und die
  CJS-Preload-Datei direkt; nur der Renderer wird von Vite gebaut.

## Offene Fragen an den Nutzer

1. **Sonderzeichen im Initialpasswort:** DECISIONS nennt `<Prefix><ddmmyyyy><Sonderzeichen>`.
   Fest `!` oder im Import-Dialog eingebbar? (Vorschlag: fest `!`.)
2. **Batch-Operation "Einstellungen ändern":** GOAL nennt E-Mail-Domain und Anzeigename-Format.
   Soll v1 das enthalten, und wenn ja mit welcher Regel (z. B. "E-Mail = `<username>@<Domain>`",
   überschreibt bestehende Adressen)? Aktuell nicht in der Operationsliste.
3. **Zielgruppen beim CSV-Import:** Soll eine angegebene, auf dem Server nicht existierende
   Gruppe automatisch angelegt werden, oder ist das ein Fehler mit Abbruch der Vorschau?
4. **Filter "Kontingentauslastung" in der Usertabelle:** welche Stufen (z. B. <50 % / 50-90 % /
   >90 % / unbegrenzt / unbekannt)?
5. **Dry-Runs in der Job-Historie:** sollen Vorschauen mitgezählt werden? (Angenommen: nein,
   nur ausgeführte Jobs.)
6. **Löschen von Usern:** soll zusätzlich ein Hinweis erscheinen, dass Nextcloud die Dateien des
   Users mitlöscht, oder genügt die Zahleneingabe-Bestätigung?
