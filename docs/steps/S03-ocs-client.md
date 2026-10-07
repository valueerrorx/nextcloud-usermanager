# S03 — OCS-Client (gemockt)

Status: approved (nach einer Revisionsrunde)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §7, §9, `docs/RESEARCH-OCS.md` (inkl. **VERIFIZIERT**),
`docs/REVIEW-NOTES.md` (14 Einträge).

## Ziel

Die HTTP-Schicht zur OCS-API im Main-Prozess, vollständig gegen injiziertes `fetch` getestet.
**Nur `client.js`.** `url.js` ist S03a, `errors.js` ist S05, der Verbindungsdialog ist S04.

## Dateien

```
src/main/ocs/client.js    createOcsClient() -> { request }
src/shared/messages.js    ERWEITERN um die 9 IDs aus Abschnitt 5 (append-only)
tests/ocsClient.test.js
tests/messages.test.js    ERWEITERN
```

## 1. Factory

```js
createOcsClient({
  baseUrl,                        // schon normalisiert, OHNE Trailing Slash
  adminUser,
  appPassword,
  fetchImpl,                      // PFLICHT, kein Default
  timeoutMs = 30000,
  retryDelaysMs = [2000, 6000],
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) -> { request }
```

**`fetchImpl` hat absichtlich keinen Default und darf nie `globalThis.fetch` sein.**
`app.on('certificate-error')` feuert nur für Chromium-Requests; mit Node/undici-`fetch` wäre die
Zertifikatsausnahme unimplementierbar. S04 verdrahtet `net.fetch`. Fehlt `fetchImpl`, wirf beim
Erzeugen — nicht erst beim ersten Request.

**Kein Instanz-Zustand.** Vier parallele `request`-Aufrufe über **eine** Instanz dürfen sich nicht
beeinflussen (die Pipeline fährt Parallelität 4). `baseUrl` wird **nicht** re-normalisiert; ein
Trailing Slash dort ist ein Aufruferfehler.

## 2. `request({ method, path, query, form })`

- URL: `${baseUrl}/ocs/v1.php${path}`. **Nur `v1.php`** (RESEARCH-OCS V1).
- `path` **muss** mit `/` beginnen und darf kein `?` oder `#` enthalten. **Aufrufer kodieren
  Pfadsegmente selbst** mit `encodeURIComponent` — echte User-IDs sind nicht auf `[a-z0-9.]`
  beschränkt (verifiziert V6: `Aaron.w`).
- `format=json` ist **immer** in der Query. Ein vom Aufrufer übergebenes `format` wird
  **überschrieben**.
- Query-Encoding über `URLSearchParams`.
- Header auf **jedem** Request: `OCS-APIRequest: true`, `Accept: application/json`,
  `Authorization: Basic ${base64(utf8(adminUser + ':' + appPassword))}`.
  **UTF-8**, nicht latin1 — Passwörter enthalten Sonderzeichen.
- `form` als `application/x-www-form-urlencoded` über `URLSearchParams`; Arrays als wiederholtes
  `groups[]`. `undefined`/`null`-Werte werden **weggelassen**, nicht als `"undefined"` gesendet.
  Ohne `form`: **kein** Body, **kein** Content-Type.
- `redirect: 'follow'` (Default). Nextcloud leitet bei fehlendem Header um; ein gefolgter Redirect
  endet dann auf HTML und damit in `notOcs`. Bei Cross-Origin-Redirect entfernt `fetch` den
  `Authorization`-Header — das Ergebnis ist dann `notOcs`, nicht `auth`.
- Timeout `timeoutMs` über `AbortSignal.timeout`. **Der Client erzeugt keinen eigenen
  `AbortController`** — die einzige mögliche Abbruchursache ist damit der Timeout. Genau deshalb
  darf ein Abort als `timeout` klassifiziert werden.
- **`request` wirft nie.** Auch nicht, wenn `fetchImpl` einen String statt eines `Error` wirft.

## 3. Result-Typ

```js
{ ok: true,  data, httpStatus, versuche }
{ ok: false, kind, httpStatus, ocsCode, messageId, message, versuche }
```

- `data = json.ocs.data ?? null`. Nie `undefined` (verschwindet über IPC).
- `data` ist **genau** `json.ocs.data`, nicht `json.ocs` und nicht `json`.
- `ocsCode` ist eine Zahl oder `null`. Auf allen Früh-Rückgabepfaden (401/403/429, Exceptions)
  ist `ocsCode: null` und es wird **kein** Body geparst.
- `httpStatus` ist eine Zahl oder `null` (bei Exceptions `null`).
- `versuche` = **Anzahl der tatsächlich getätigten `fetchImpl`-Aufrufe**. 1 = kein Retry.
- **`message` ist ausnahmslos `MESSAGES[messageId]`.** Nie `err.message`, nie `ocs.meta.message`.
  Der Server sendet eigene deutsche Texte (verifiziert V5), und eine Node-Fehlermeldung kann den
  `Authorization`-Header mitsamt App-Passwort enthalten.

## 4. Klassifikation — verbindliche Prüfreihenfolge

**A. `fetchImpl` hat geworfen** (vor jeder HTTP-Auswertung):
1. `err.name` oder `err.cause?.name` ist `'TimeoutError'` oder `'AbortError'`
   -> `timeout` / `zeitueberschreitung`.
   (undici lehnt beim Body-Lesen als `TypeError: terminated` ab, mit der Ursache in `cause`.)
2. `typeof err.cause?.code === 'string'` **und** Code in `CERT_CODES`
   -> `cert` / `zertifikat_nicht_vertraut`.
   `CERT_CODES` ist eine **explizite Menge**, kein Prefix-Match:
   `SELF_SIGNED_CERT_IN_CHAIN`, `DEPTH_ZERO_SELF_SIGNED_CERT`,
   `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`,
   `UNABLE_TO_GET_ISSUER_CERT`, `CERT_HAS_EXPIRED`, `CERT_NOT_YET_VALID`,
   `CERT_UNTRUSTED`, `ERR_TLS_CERT_ALTNAME_INVALID`, `HOSTNAME_MISMATCH`.
   Die beiden häufigsten Internal-CA-Codes stehen bewusst drin — ein Prefix-Match auf `CERT_`
   hätte sie übersehen und einen erreichbaren Server als „nicht erreichbar" gemeldet.
   **Der `typeof`-Check ist Pflicht**: ein `.startsWith` auf `undefined` würde im `catch` werfen
   und einen Netzwerkfehler in eine unbehandelte Rejection verwandeln.
3. Alles andere -> `network` / `server_nicht_erreichbar`.
   (`err.cause` kann ein `AggregateError` sein — Dual-Stack-`ECONNREFUSED` mit dem Code in
   `cause.errors[0].code`. Fällt hier korrekt in `network`.)

**B. HTTP-Status, vor dem Envelope** — weil 401/403/429 häufig ohne gültigen OCS-Body kommen:
4. 401 -> `auth` / `falsche_zugangsdaten`
5. 403 -> `forbidden` / `kein_admin`
6. 429 -> `ratelimit` / `server_blockt_vorerst`

**C. Envelope:**
7. Body nicht als JSON parsebar (auch 204 und leerer Body), **oder** `json.ocs` ist kein Objekt,
   **oder** `json.ocs.meta` ist kein Objekt, **oder** `json.ocs.meta.statuscode` ist keine Zahl
   -> `notOcs` / `falscher_basispfad`.
8. `statuscode === 997` -> `forbidden` / `kein_admin`
9. `statuscode !== 100` -> `ocs` / `ocs_fehler`, `ocsCode` gesetzt
10. HTTP nicht 2xx bei gültigem Envelope und `statuscode === 100`
    -> `http` / `unerwarteter_serverfehler`
11. Sonst Erfolg.

**429 darf niemals** als `server_nicht_erreichbar` oder `falsche_zugangsdaten` erscheinen.

## 5. Neue messageIds

| id | deutsche Meldung |
|---|---|
| `falsche_zugangsdaten` | Benutzername oder App-Passwort ist falsch. |
| `kein_admin` | Dieses Konto hat keine Administratorrechte. |
| `server_blockt_vorerst` | Der Server blockt Anfragen vorübergehend. Bitte einige Minuten warten. |
| `falscher_basispfad` | Keine Nextcloud-API unter dieser Adresse gefunden. Bitte die Server-URL prüfen. |
| `server_nicht_erreichbar` | Server nicht erreichbar. Bitte Adresse und Netzwerk prüfen. |
| `zeitueberschreitung` | Der Server hat nicht rechtzeitig geantwortet. |
| `zertifikat_nicht_vertraut` | Das Zertifikat des Servers ist nicht vertrauenswürdig. |
| `unerwarteter_serverfehler` | Unerwartete Antwort des Servers. |
| `ocs_fehler` | Der Server hat die Anfrage abgelehnt. |

## 6. Retry

Die Entscheidung hängt am **HTTP-Status**, nicht am `kind` — HTTP 500 mit `statuscode 101` ergibt
`kind: 'ocs'`, soll aber als 5xx behandelt werden.

| Auslöser | Methoden | Wiederholungen |
|---|---|---|
| HTTP 429 | **alle** | 2 |
| HTTP 5xx | **nur `GET`/`HEAD`** | 1 |
| `kind: 'network'` | **nur `GET`/`HEAD`** | 1 |
| alles andere | – | 0 |

**Warum 5xx nur bei GET:** Ein 502/504 vom Reverse Proxy heißt, der Request *wurde* weitergeleitet
und kann durchgelaufen sein. Ein wiederholtes `POST /cloud/users` meldet dann `102 user exists`,
obwohl der User angelegt wurde; ein wiederholtes `DELETE` meldet `101 not found`, obwohl gelöscht
wurde. Bei 429 lehnt die Brute-Force-Sperre **vor** der Verarbeitung ab, daher dort alle Methoden.

- Wartezeit vor Versuch *n* ist `retryDelaysMs[n-1]`. Ist kein Eintrag vorhanden
  (z. B. `retryDelaysMs: []` oder `[5]`), wird **nicht weiter** wiederholt.
- **Globale Obergrenze `versuche <= 3`**, als Invariante getestet — sonst kann eine Folge
  429 -> network -> 429 kreisen.
- Nach erschöpften Retries wird das **letzte** Ergebnis unverändert zurückgegeben.
- **Auflösung des Widerspruchs `notOcs` vs. 5xx (Tech-Lead):** Der **HTTP-Status gewinnt**.
  Ein 5xx wird bei `GET`/`HEAD` auch dann einmal wiederholt, wenn der Body unparsebar ist — ein
  echter 502/504 vom Reverse Proxy liefert eine HTML-Seite, und ohne diese Regel wäre der
  5xx-Retry in der Praxis unerreichbar. Für 2xx-Antworten mit HTML bleibt es bei `notOcs`
  **ohne** Retry (dort ist der Basis-Pfad falsch, Wiederholen hilft nicht).
- Bei `auth`, `forbidden`, `timeout`, `cert` und bei `notOcs` **mit 2xx** wird **nie** wiederholt. Ein falsches
  Passwort zu wiederholen verschärft nur die Brute-Force-Sperre.

## Abnahmekriterien (alle automatisiert, `fetchImpl` injiziert)

1. **Header-Pflicht.** Jeder Request trägt die drei Header. Der Basic-Wert dekodiert zu genau
   `user:passwort` — **mit einem Passwort, das `:` und ein Nicht-ASCII-Zeichen enthält**
   (z. B. `pa:ß wort`), um UTF-8-statt-latin1 zu belegen.
   **Mutationsbeweis beilegen** (gegen eine **Kopie** in einem Scratch-Verzeichnis, nie gegen
   `src/`): Entfernen von `OCS-APIRequest` macht mindestens einen Test rot.
2. **Exakte URL.** `request({ method:'GET', path:'/cloud/users', query:{ limit:1 } })` gegen
   `baseUrl='https://h'` erzeugt **genau** `https://h/ocs/v1.php/cloud/users?limit=1&format=json`
   (Stringvergleich, kein `toContain`). Ein vom Aufrufer übergebenes `format=xml` wird
   überschrieben.
3. **Erfolg.** HTTP 200 + `statuscode 100` -> `ok: true`; `data` deep-equals ein verschachteltes
   Fixture **und** `data !== json.ocs` **und** `data !== json`. Fehlendes `ocs.data` -> `data === null`.
4. **Erfolg verlangt beides.** HTTP 200 + `statuscode 101` -> `ok: false`, `kind: 'ocs'`.
   HTTP 500 + `statuscode 100` -> `ok: false`, `kind: 'http'`.
5. **v2-Falle.** `statuscode: 200` -> `ok: false`, `kind: 'ocs'`, `ocsCode: 200`. Hält fest, dass
   die Prüfung nicht „gelockert" werden darf.
6. **Klassifikationstabelle als Fixture-Tabelle**, je Zeile mit Status, Headern, Body und
   erwarteten `kind`, `messageId`, `httpStatus`, `ocsCode`, `versuche`. Mindestens diese Zeilen:
   401 · 403 · 429 · 997-im-Envelope · HTML 200 · 302-auf-HTML · 204 ohne Body ·
   `ocs` ohne `meta` · `statuscode` als String · 500 mit gültigem Envelope.
7. **Exception-Pfade, drei Timeout-Varianten:** `DOMException`-artig mit `name:'TimeoutError'`;
   `name:'AbortError'`; `TypeError` mit `cause.name === 'TimeoutError'`. Alle -> `kind: 'timeout'`.
8. **Zertifikat:** je ein Fall für `UNABLE_TO_VERIFY_LEAF_SIGNATURE` und
   `DEPTH_ZERO_SELF_SIGNED_CERT` -> `kind: 'cert'`. Zusätzlich ein geworfener Fehler **ohne**
   `cause` -> `kind: 'network'` (belegt den `typeof`-Guard).
9. **Nicht-`Error` geworfen** (ein String) -> `kind: 'network'`, kein Throw nach außen.
10. **Retry, exakte Aufrufliste.** 429 dreimal -> `versuche === 3` und
    `sleep.mock.calls` deep-equals `[[2000],[6000]]`. Erfolg nach einem 429 -> `ok: true`,
    `versuche === 2`. `auth` -> `versuche === 1`, `sleep` **nie** aufgerufen.
    **`GET` mit 500 -> `versuche === 2`; `POST` mit 500 -> `versuche === 1`** (der Kern der
    Methodenunterscheidung). `POST` mit 429 -> `versuche === 3`.
    `retryDelaysMs: []` mit 429 -> `versuche === 1`. Folge 429 -> network -> 429 -> `versuche <= 3`.
11. **Kein Secret-Leak, realistisch statt vakuum.** Zwei Fälle:
    (a) `fetchImpl` wirft `new Error('connect ECONNREFUSED ... Basic ' + base64(user+':'+pw))`;
    (b) der Server antwortet mit `ocs.meta.message`, das das Passwort enthält.
    In **beiden** Fällen darf das Passwort weder in `JSON.stringify(result)` noch in
    `result.message` noch in `result.messageId` vorkommen. Diese zwei Fälle töten genau die zwei
    naheliegenden Bugs `message: err.message` und `message: meta.message`.
12. **Form-Encoding.** `form: { groups:['a','b'], quota:'1 GB', leer: undefined, nix: null }`
    ergibt den Body **genau** `groups%5B%5D=a&groups%5B%5D=b&quota=1+GB`
    (`URLSearchParams`-Kodierung: `+` statt `%20`; `undefined`/`null` weggelassen) und
    `Content-Type: application/x-www-form-urlencoded`. Ohne `form`: **kein** Body, **kein**
    Content-Type.
13. **Parallelität.** Vier gleichzeitige `request`-Aufrufe über **eine** Instanz, mit
    unterschiedlichen Antworten, liefern unabhängige Results und `versuche`-Werte.
14. **`fetchImpl` fehlt** -> `createOcsClient` wirft beim Erzeugen, nicht beim ersten Request.
15. **`messages.js`:** die 9 neuen IDs. **Vorwärtsrichtung durch Treiben des Produzenten** —
    jede ID wird über `request` mit passend gemocktem `fetchImpl` erzeugt, nicht per
    Literal-Vergleich auf die Map. Keine Prüfung auf unbenutzte IDs.
16. `npm test` und `npm run lint` grün.

## Ausdrücklich NICHT in diesem Schritt

- **Kein `src/shared/url.js`** und keine `url_*`-IDs. Das ist **S03a**.
- **Kein `src/main/ocs/errors.js`**, kein `mapOcsError`. Das ist **S05**, zusammen mit den ersten
  echten Endpunkt-Maps. Ein Mechanismus ohne Aufrufer ist keine vertikale Scheibe.
- Kein `ocs/connection.js`, keine `checkConnection()`. Das ist S04.
- Kein `session.js`, `credentials.js`, `safeStorage`, `tls.js`. S03 **klassifiziert**
  Zertifikatsfehler, es behandelt sie nicht.
- Kein `ocs/users.js`, `ocs/groups.js`, `ocs/userList.js`, keine `users/details`-Probe,
  kein N+1-Fallback, kein `userView.js`, kein `quota.js`.
- Keine neuen IPC-Kanäle, keine Preload-Änderung, keine UI, keine Vue-Datei.
- Kein echter Netzwerkzugriff in Tests.
- Keine neuen Abhängigkeiten.

## Fallen aus docs/REVIEW-NOTES.md

- **1:** `OCS-APIRequest` auf jedem Request.
- **2:** HTTP 200 ist kein Erfolg — beide Bedingungen prüfen.
- **3:** Keine globale Statuscode-Tabelle. In S03 existiert **keine** Code-Map außer `997`.
- **5:** `429` ist ein eigener Fehlerfall mit Backoff, nie ein User-Fehler.
- **8:** Das App-Passwort verlässt den Main-Prozess nie, auch nicht in Fehlermeldungen.
- **`[S02]`:** Grenzwerte tatsächlich einsetzen; Defaults an Eingaben prüfen, bei denen sie zählen;
  Mutationsbeweise nur gegen Kopien; bei „genau dann, wenn" beide Richtungen; Testname und
  Assertion müssen übereinstimmen.
