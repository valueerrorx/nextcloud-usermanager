# S05 — Userliste lesen

Status: spec (schlanker Modus — ein Review, MINOR wird notiert)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §4, §7, `docs/RESEARCH-OCS.md` Abschnitt
**VERIFIZIERT**, `docs/REVIEW-NOTES.md` (24 Einträge).

## Ziel

Die Userliste wird geladen und in der Tabelle angezeigt — mit Loading, Empty und Error.
Zwei Durchläufe: **A** = Main + pure Module, **B** = Renderer.

Nur **Lesen**. Keine Aktionen, keine Filter, keine Auswahl, kein Dashboard.

---

## Verifizierte Fakten, die hier zählen (RESEARCH-OCS)

1. **Die beiden Lesewege liefern `data.users` in unterschiedlicher Form:**
   - `GET /cloud/users/details` -> `data.users` ist ein **Objekt**, gekeyt nach `userid`:
     `{ "Aaron.w": { enabled, id, quota: {...}, email, displayname, groups, ... } }`
   - `GET /cloud/users` -> `data.users` ist ein **Array von Strings** (nur IDs).
   In JS ist ein Array auch ein Objekt — die Probe muss daher auf
   **„Objekt und kein Array"** prüfen, nicht nur auf `typeof === 'object'`.
2. **Quota ist auf beiden Wegen ein Objekt** `{ free, used, total, relative, quota }`.
   Die Degradation zu `unknown` tritt auf dieser Instanz nicht ein.
3. **Unbegrenzt ist `-3`** in `quota`, `total` **und** `free`. `used` ist trotzdem eine echte Zahl.
4. **`relative` ist bei unbegrenzt `0`.** Dieses Feld wird **nicht** verwendet — `usagePercent`
   wird selbst gerechnet. Sonst erschiene ein unbegrenzter User als „0 % belegt".
5. **`email` kann `null` sein**, nicht `""`.
6. **User-IDs enthalten Großbuchstaben** (`Aaron.w`). Der Vergleich für
   `istVerbundenerAdmin` ist **case-insensitiv**.
7. **Nur `/ocs/v1.php`.** v2 liefert `statuscode: 200` und würde die Envelope-Prüfung brechen.

---

## Teil A — Main und pure Module

### A1. `src/shared/quota.js`
```js
parseQuota(raw) -> QuotaInfo   // { kind, limitBytes, usedBytes, usagePercent, roh }
formatBytes(bytes|null) -> string
```
Abbildung **genau** wie ARCHITECTURE §4 (die Tabelle dort ist verbindlich):
`-3`/`"none"` -> `unlimited`; Objekt mit numerischem `quota > 0` -> `limited`;
Skalar `0`/`"0"` -> **`unknown`** (nicht `limited: 0`); `null`/abwesend/`{total:null}` -> `unknown`;
`"1 GB"`/`"100MB"`/numerischer String -> `limited` mit geparsten Bytes;
negative Werte ≠ `-3` -> `unknown`.

`usagePercent` nur bei `kind === 'limited' && limitBytes > 0 && usedBytes != null`.
`usedBytes` wird auch bei `unlimited` übernommen, wenn `used` eine Zahl ist (Fakt 3).
`formatBytes`: GiB-Basis 1024, eine Dezimalstelle, **deutsches Komma**, `null` -> `"unbekannt"`.

**`relative` aus der Antwort wird ignoriert.** Ein Test hält das fest: ein Eingang mit
`relative: 99` und `quota: -3` ergibt `unlimited` **ohne** `usagePercent`.

### A2. `src/shared/userView.js`
```js
toUserView(rawUser, { adminUserId }) -> UserView
```
- `email: null` bleibt `null` (nicht `""`, nicht der String `"null"`).
- `groups` fehlt oder ist kein Array -> `[]`.
- `enabled` wird zu einem echten Boolean gezwungen.
- `displayname` fehlt -> `userid` als Rückfall.
- `istVerbundenerAdmin`: `userid.toLowerCase() === adminUserId.toLowerCase()`.
- `quota` über `parseQuota`.

### A3. `src/shared/pool.js`
```js
runPool(items, worker, { concurrency = 4, shouldStop }) -> Promise<results[]>
```
Pur, kein I/O. Wird in S05 vom N+1-Fallback gebraucht und in S07 von der Pipeline —
deshalb jetzt **einmal** gebaut statt zweimal inline.
- Höchstens `concurrency` Worker gleichzeitig in Flug.
- Ergebnisse **in Eingabereihenfolge**, unabhängig von der Abschlussreihenfolge.
- Jedes Item genau einmal.
- `shouldStop()` wird **vor jedem Dispatch** gefragt; ist es wahr, werden die restlichen Items
  ohne Aufruf des Workers als `{ nichtAusgefuehrt: true }` verbucht.
- Ein werfender Worker bricht den Pool **nicht** ab; der Fehler landet im Ergebnis dieses Items.

### A4. `src/main/ocs/errors.js` (aus S03 verschoben)
```js
mapOcsError(result, endpointMap, fallbackId) -> result
```
- `result.ok === true` -> wirft (Programmierfehler).
- `kind === 'ocs'` -> `endpointMap[result.ocsCode]`, sonst `fallbackId`.
- **Jedes andere `kind`** -> `messageId` bleibt **unverändert**. Keine endpunktspezifischen Codes
  für `auth`, `forbidden`, `ratelimit`, `notOcs`, `network`, `timeout`, `cert`, `http`.
- `message` wird passend zur neuen `messageId` aus `messages.js` gesetzt.
- **Keine globale Code-Tabelle in dieser Datei.**

### A5. `src/main/ocs/users.js`
```js
listUserIds(client)      // GET /cloud/users        -> string[]
listUserDetails(client)  // GET /cloud/users/details -> rohes data.users-Objekt
getUser(client, userid)  // GET /cloud/users/{encodeURIComponent(userid)}
```
Jede Funktion mit **eigener** lokaler Fehlercode-Map und `mapOcsError`.
Für `getUser`: `101` -> `user_nicht_gefunden`, `404`/`998` fällt über `kind` durch.
**`userid` wird mit `encodeURIComponent` kodiert** — der Client kodiert Pfade nicht
(DECISIONS „Pfad-Encoding liegt beim Aufrufer"), und echte IDs enthalten `.` und Großbuchstaben.

### A6. `src/main/ocs/userList.js`
```js
fetchAllUsers({ client, adminUserId, onProgress, shouldStop }) -> { ok, users, mode } | Fehler
```
1. Probe: `listUserDetails`.
2. **Fallback-Trigger, genau diese fünf:** HTTP 404 · `kind === 'notOcs'` ·
   `statuscode !== 100` · `data.users` fehlt **oder ist kein Objekt oder ist ein Array** ·
   der erste Eintrag hat **weder** `enabled` **noch** `quota`.
3. Fallback: `listUserIds`, dann `getUser` je ID über `runPool` mit `concurrency: 4`,
   `onProgress({ geladen, gesamt })` nach jedem Item.
4. Ergebnis beider Wege läuft durch `toUserView` -> **identische Identitätsfelder**
   `userid`, `displayname`, `email`, `enabled`, `groups`.
5. `mode` ist `'details'` oder `'fallback'` und wird in `session.userListMode`
   **für die Sitzung memoisiert**; beim nächsten Aufruf wird die Probe übersprungen.
   Neu bestimmt wird sie nur bei `connect`/`connectSaved`.
6. Einzelne fehlgeschlagene `getUser`-Aufrufe im Fallback brechen **nicht** ab — die
   betroffenen IDs fehlen in der Liste und werden als Anzahl zurückgegeben
   (`uebersprungen: number`), damit das UI es nennen kann.

### A7. IPC und Preload
- `users.list` (invoke) -> `{ ok, users, mode, uebersprungen, fetchedAt }`.
  Ohne Verbindung -> `{ ok: false, messageId: 'nicht_verbunden' }`.
- `users.onLoadProgress` (main->renderer) -> `{ geladen, gesamt }`.
- Preload: beide **namentlich**, Event-Abo gibt einen Disposer zurück.
- **`connect` setzt `session.userListMode` auf `null` zurück**, damit nach einem Serverwechsel
  neu geprobt wird.

---

## Teil B — Renderer

- `src/renderer/components/StateBlock.vue`: Loading / Empty / Error, deutscher Text.
- `src/renderer/components/QuotaCell.vue`: rendert nur `QuotaInfo` plus `formatBytes`.
  **Rechnet nichts** (DECISIONS „Berechnungen gehören nie in Vue-Komponenten").
- `src/renderer/components/UserTable.vue`: reine Leseansicht. Spalten
  Benutzername, Anzeigename, E-Mail, Status (aktiv/deaktiviert), Gruppen, Kontingent.
  Noch **keine** Auswahl, **keine** Sortierung, **kein** Filter — das ist S06.
- `src/renderer/views/UsersView.vue`: lädt beim Betreten, „Neu laden"-Button,
  Zeitstempel des Datenstands, Fortschrittsanzeige während des N+1-Fallbacks mit der Warnung
  „Einzelabfragen, das kann dauern", und ein Hinweis, falls `uebersprungen > 0`.
- `state.js`: `users`, `usersMode`, `usersFetchedAt`, `usersLadezustand`, `usersFehler`.

---

## Neue messageIds
`nicht_verbunden`, `user_nicht_gefunden`, `userliste_fehlgeschlagen`,
`einzelabfragen_aktiv` (Warntext für den Fallback-Modus),
`einige_user_uebersprungen`.
Texte vom Coder formulieren, kurz und ohne Fachjargon; ich trage sie danach hier nach.

## Abnahmekriterien

**Automatisiert, Ziel ~35 Tests:**
1. `parseQuota`: alle Zeilen der Tabelle in ARCHITECTURE §4 plus der `relative`-Ignorier-Test.
2. `formatBytes`: `null`, 0 Bytes, exakt 1 GiB, 1,5 GiB mit deutschem Komma.
3. `toUserView`: `email: null` bleibt `null`; fehlende `groups` -> `[]`;
   `istVerbundenerAdmin` **case-insensitiv** (`Aaron.w` vs. `aaron.w`);
   fehlender `displayname` -> `userid`.
4. `runPool`: nie mehr als 4 gleichzeitig in Flug (Zähler); Ergebnisse in Eingabereihenfolge
   bei absichtlich verdrehten Abschlusszeiten; jedes Item genau einmal; ein werfender Worker
   bricht nicht ab; `shouldStop` nach Item 3 -> Rest `nichtAusgefuehrt`.
5. `mapOcsError`: `ocs` mit Code in der Map; Code **nicht** in der Map -> `fallbackId`;
   `kind: 'auth'` mit einer Map, die `401` enthielte -> ID bleibt `falsche_zugangsdaten`
   und die Map wird **ignoriert**; `ok: true` -> wirft.
6. **Fallback-Trigger, je ein Test pro Bedingung** — besonders:
   `data.users` ist ein **Array** muss den Fallback auslösen (sonst würde die Probe die
   ID-Liste für Details halten).
7. **Beide Wege, gleiche Identitätsfelder:** derselbe User über Details und über den
   Fallback ergibt gleiche `userid`, `displayname`, `email`, `enabled`, `groups`.
8. **Session-Memo:** zweiter `fetchAllUsers`-Aufruf probt **nicht** erneut; nach `connect`
   wird wieder geprobt.
9. Ein fehlgeschlagener `getUser` im Fallback -> Liste ohne diesen User, `uebersprungen === 1`.
10. `users.list` ohne Verbindung -> `{ ok: false, messageId: 'nicht_verbunden' }`.
11. `getUser` kodiert die `userid` im Pfad (Test mit einer ID, die ein Sonderzeichen enthält).

**Manuell** (in `docs/MANUAL-TEST.md`): Liste gegen `cloud.xapient.solutions` laden,
Zeitstempel, „Neu laden", Empty-State, Fehlerzustand bei abgezogenem Netz.

## Ausdrücklich NICHT

- Keine Suche, keine Filter, keine Sortierung, keine Mehrfachauswahl (S06).
- Keine Aktionen, kein Dry-Run, kein Batch, keine Pipeline, kein `operations.js` (S07/S08).
- Kein `dashboard.js`, `filters.js`, `resultCsv.js`, `dryRun.js`.
- Keine Gruppenverwaltung, kein CSV, kein Import.
- Kein Setzen von Kontingenten, keine Quota-Presets, kein `formatQuotaForApi`.
- Keine neuen Abhängigkeiten.
- **Scope-Guards pflegen:** `tests/skeleton.test.js` verbietet noch `actions` in `src/main/`
  (bleibt verboten) — aber prüfe, ob neu entstandene Dateien dort noch als verboten gelistet
  sind (REVIEW-NOTES `[S03]`).
