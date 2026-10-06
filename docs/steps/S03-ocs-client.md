# S03 — OCS-Client (gemockt)

Status: spec
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §7, §9, `docs/RESEARCH-OCS.md` (inkl. Abschnitt
**VERIFIZIERT**), `docs/REVIEW-NOTES.md` (14 Einträge, alle gültig).

## Ziel

Die HTTP-Schicht zur Nextcloud-OCS-API im Main-Prozess, vollständig gegen gemocktes `fetch`
getestet. **Kein UI, kein Dialog, keine Credential-Speicherung, kein echter Netzwerkzugriff.**

## Dateien

```
src/main/ocs/client.js    createOcsClient() -> { request }; Envelope-Unwrap, Result-Typ,
                          Retry/Backoff, Timeout
src/main/ocs/errors.js    mapOcsError(result, endpointMap, fallbackId)
src/shared/url.js         normalizeBaseUrl(input) -> { ok, baseUrl } | { ok:false, messageId }
src/shared/messages.js    ERWEITERN um die IDs aus Abschnitt 5 (append-only)
tests/ocsClient.test.js
tests/ocsErrors.test.js
tests/url.test.js
tests/messages.test.js    ERWEITERN
```

## 1. Credentials werden injiziert, nicht aus `session.js` gelesen

`ARCHITECTURE.md` §7 sagte „Credentials kommen aus `session.js`". **Das wird hiermit geändert**
(DECISIONS „Credential-Übergabe an den OCS-Client"):

```js
createOcsClient({
  baseUrl,            // schon normalisiert, ohne Trailing Slash
  adminUser,
  appPassword,
  timeoutMs = 20000,
  retryDelaysMs = [2000, 6000],
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  fetchImpl = globalThis.fetch,
}) -> { request }
```

Begründung: Ein Modul, das ein Singleton liest, ist nur mit Mock testbar — genau der Fehler, den
`pipeline.js` wegen REVIEW-NOTES vermeiden musste. `session.js` (S04) hält künftig die
**Client-Instanz**, nicht der Client die Session.

`sleep` und `retryDelaysMs` sind injizierbar, damit Retry-Tests nicht 8 Sekunden warten.
`fetchImpl` ebenso, damit kein globaler Stub nötig ist.

## 2. `request({ method, path, query, form })`

- URL: `${baseUrl}/ocs/v1.php${path}`. **Ausschließlich `v1.php`** — siehe Abschnitt 6.
- `format=json` ist **immer** in der Query, auch wenn `query` fehlt.
- Header auf **jedem** Request:
  `OCS-APIRequest: true`, `Accept: application/json`,
  `Authorization: Basic ${base64(adminUser + ':' + appPassword)}`.
- `form` wird als `application/x-www-form-urlencoded` gesendet. Arrays als wiederholtes
  `groups[]`. Fehlt `form`, wird **kein** Body und **kein** Content-Type gesetzt.
- Timeout `timeoutMs` über `AbortSignal.timeout`.
- **Das App-Passwort erscheint in keinem Result, keiner Meldung, keinem Log, keiner Exception.**

## 3. Erfolg und Envelope

Erfolg **nur** wenn HTTP 2xx **und** `json.ocs.meta.statuscode === 100`.

```js
{ ok: true, data, httpStatus }
{ ok: false, kind, httpStatus, ocsCode, messageId, message }
```

`kind` ist genau einer von:
`'ocs' | 'http' | 'auth' | 'forbidden' | 'ratelimit' | 'notOcs' | 'network' | 'timeout' | 'cert'`

Klassifikation, **in dieser Prüfreihenfolge** (sie entscheidet bei Mehrdeutigkeit):

| Bedingung | `kind` | `messageId` |
|---|---|---|
| `fetch` wirft mit `name === 'TimeoutError'` oder `AbortError` | `timeout` | `zeitueberschreitung` |
| `fetch` wirft mit Zertifikatsursache (`cause.code` beginnt mit `CERT_`, `DEPTH_ZERO…`, `SELF_SIGNED…`, `ERR_TLS_`) | `cert` | `zertifikat_nicht_vertraut` |
| `fetch` wirft sonst (`ENOTFOUND`, `ECONNREFUSED`, `EAI_AGAIN`, …) | `network` | `server_nicht_erreichbar` |
| HTTP 401 | `auth` | `falsche_zugangsdaten` |
| HTTP 403 | `forbidden` | `kein_admin` |
| HTTP 429 | `ratelimit` | `server_blockt_vorerst` |
| Body nicht als JSON parsebar **oder** `json.ocs` fehlt | `notOcs` | `falscher_basispfad` |
| `statuscode === 997` | `forbidden` | `kein_admin` |
| `statuscode !== 100` | `ocs` | `ocs_fehler` (Endpunkt-Map überschreibt später) |
| HTTP nicht 2xx, Envelope aber gültig | `http` | `unerwarteter_serverfehler` |

**Wichtig:** HTTP-Status wird **vor** dem Envelope geprüft, weil 401/403/429 häufig ohne
gültigen OCS-Body kommen. Ein 429 darf **niemals** als `server_nicht_erreichbar` oder
`falsche_zugangsdaten` erscheinen (RESEARCH-OCS §6: ein Tippfehler löst die Brute-Force-Sperre aus,
und „falsches Passwort" wäre dann eine irreführende Diagnose).

## 4. Retry und Backoff

- `kind: 'ratelimit'` -> bis zu **2** Wiederholungen, Wartezeiten `retryDelaysMs` = 2000, 6000 ms.
- `kind: 'network'` **oder** HTTP 5xx -> genau **1** Wiederholung (erste Wartezeit).
- `kind: 'timeout'`, `'auth'`, `'forbidden'`, `'notOcs'`, `'cert'`, `'ocs'` -> **keine**
  Wiederholung. Ein falsches Passwort zu wiederholen verschärft nur die Brute-Force-Sperre.
- Nicht-idempotente Methoden werden **ebenfalls** wiederholt, aber nur bei `ratelimit` und
  `network`/5xx — in beiden Fällen ist davon auszugehen, dass der Request den Server nicht
  erreicht oder abgelehnt wurde. Das ist eine bewusste Abwägung, siehe DECISIONS.
- Nach erschöpften Retries wird das **letzte** Ergebnis zurückgegeben, unverändert.
- Das Result trägt zusätzlich `versuche: number` (1 = kein Retry), damit Tests die Zählung prüfen
  können, ohne auf Timing zu bauen.

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
| `url_leer` | Bitte eine Server-Adresse eingeben. |
| `url_kein_schema` | Bitte die Adresse mit https:// angeben. |
| `url_nur_https` | Nur https wird unterstützt. |
| `url_ungueltig` | Diese Adresse ist keine gültige URL. |

## 6. `shared/url.js` — `normalizeBaseUrl(input)`

Rein, kein I/O. Gibt `{ ok: true, baseUrl }` oder `{ ok: false, messageId }`.

Regeln, **in dieser Prüfreihenfolge**:
1. Leer, nur Whitespace oder kein String -> `url_leer`.
2. Kein `://` -> `url_kein_schema`. (Wir ergänzen **nicht** stillschweigend `https://`, weil der
   Nutzer sonst nicht merkt, dass er `http` gemeint hat.)
3. Schema vorhanden, aber nicht `https` -> `url_nur_https` (DECISIONS „TLS / Serverzertifikat").
4. Nicht als `URL` parsebar -> `url_ungueltig`.
5. Normalisierung des Ergebnisses:
   - Trailing Slashes entfernen.
   - Angehängtes `/index.php` entfernen.
   - Angehängten `/ocs`-Teil entfernen (`/ocs`, `/ocs/v1.php`, `/ocs/v2.php/cloud/users`, …)
     — der Nutzer kopiert gern eine API-URL aus der Doku.
   - `/settings/...`, `/apps/...` und `/login` ebenfalls entfernen.
   - Query und Fragment verwerfen.
   - Host lowercase, Pfad-Rest bleibt wie eingegeben (Subpath-Installationen wie
     `https://host/nextcloud` müssen erhalten bleiben).

### Pflichttestfälle mit erwartetem Ergebnis
| Eingabe | Ergebnis |
|---|---|
| `'https://cloud.xapient.solutions'` | `https://cloud.xapient.solutions` |
| `'https://cloud.xapient.solutions/'` | `https://cloud.xapient.solutions` |
| `'https://cloud.xapient.solutions///'` | `https://cloud.xapient.solutions` |
| `'https://Cloud.Xapient.Solutions'` | `https://cloud.xapient.solutions` |
| `'https://host/nextcloud'` | `https://host/nextcloud` (Subpath bleibt) |
| `'https://host/nextcloud/'` | `https://host/nextcloud` |
| `'https://host/index.php'` | `https://host` |
| `'https://host/nextcloud/index.php'` | `https://host/nextcloud` |
| `'https://host/ocs/v1.php/cloud/users'` | `https://host` |
| `'https://host/nextcloud/ocs/v2.php'` | `https://host/nextcloud` |
| `'https://host/settings/admin'` | `https://host` |
| `'https://host/login'` | `https://host` |
| `'https://host/?foo=1#x'` | `https://host` |
| `'http://host'` | `url_nur_https` |
| `'ftp://host'` | `url_nur_https` |
| `'cloud.xapient.solutions'` | `url_kein_schema` |
| `''`, `'   '`, `null`, `42` | `url_leer` |
| `'https://'` | `url_ungueltig` |

## 7. `ocs/errors.js` — `mapOcsError(result, endpointMap, fallbackId)`

- Ist `result.ok` -> Programmierfehler, wirf. `mapOcsError` wird nur auf Fehler angewendet.
- Bei `kind === 'ocs'`: `endpointMap[result.ocsCode]` benutzen, sonst `fallbackId`.
- Bei **jedem anderen** `kind`: die `messageId` aus dem Result **unverändert** behalten.
  `mapOcsError` kennt **keine** endpunktspezifischen Codes für `auth`, `forbidden`, `ratelimit`,
  `notOcs`, `network`, `timeout`, `cert`, `http` (REVIEW-NOTES 3).
- Rückgabe: dasselbe Result mit ersetzter `messageId` und passendem `message` aus `messages.js`.
- **Keine globale Code-Tabelle.** `errors.js` enthält **keine** Zahl-zu-ID-Zuordnung; die Maps
  leben bei den Endpunkten (ab S05).

## Abnahmekriterien (alle automatisiert, `fetch` injiziert)

1. **Header-Pflicht:** Jeder Request trägt `OCS-APIRequest: true`, `Accept: application/json`
   und ein korrektes `Authorization: Basic`. Ein Test dekodiert den Basic-Header und prüft
   `user:password`. **Mutationsbeweis beilegen**, dass das Entfernen von `OCS-APIRequest`
   mindestens einen Test rot macht.
2. **`format=json` immer dabei** — auch bei fehlendem `query` und bei zusätzlicher Query.
3. **Erfolg:** HTTP 200 + `statuscode 100` -> `{ ok: true, data }`, `data` ist genau
   `json.ocs.data`.
4. **Erfolg verlangt beides:** HTTP 200 mit `statuscode 101` -> `ok: false`, `kind: 'ocs'`.
   HTTP 500 mit `statuscode 100` im Body -> `ok: false`.
   **Dieser zweite Fall ist Pflicht** — er ist der Grund, warum die Prüfung zweiteilig ist.
5. **v2-Falle:** Eine Antwort mit `statuscode: 200` (so antwortet `/ocs/v2.php`, RESEARCH-OCS V1)
   ergibt `ok: false`, `kind: 'ocs'`, `ocsCode: 200`. Ein Test hält das fest, damit niemand die
   Prüfung „lockert", ohne es zu merken.
6. **Jede Zeile der Klassifikationstabelle in Abschnitt 3** als eigener Fall, mit dem erwarteten
   `kind` **und** der erwarteten `messageId`. Insbesondere: 429 ergibt **nie**
   `server_nicht_erreichbar` oder `falsche_zugangsdaten`.
7. **HTML-Antwort** (`<!DOCTYPE html>…`, Content-Type `text/html`, HTTP 200) ->
   `kind: 'notOcs'`, `messageId: 'falscher_basispfad'`.
8. **Retry:** `ratelimit` dreimal hintereinander -> `versuche === 3`, `sleep` wurde mit
   `2000` und dann `6000` aufgerufen. `network` -> `versuche === 2`. `auth` -> `versuche === 1`
   und `sleep` **nie** aufgerufen. HTTP 500 -> `versuche === 2`.
   Erfolg nach einem 429 -> `ok: true`, `versuche === 2`.
9. **Timeout:** `fetchImpl`, das mit `name: 'TimeoutError'` wirft -> `kind: 'timeout'`,
   `versuche === 1`.
10. **Kein Secret-Leak:** Ein Test serialisiert bei **jedem** Fehler-`kind` das komplette Result
    mit `JSON.stringify` und behauptet, das App-Passwort kommt darin nicht vor. Zusätzlich darf
    es in `message` und `messageId` nicht vorkommen.
11. **Form-Encoding:** `form: { groups: ['a','b'], quota: 'none' }` ergibt den Body
    `groups%5B%5D=a&groups%5B%5D=b&quota=none` (Reihenfolge wie eingefügt) und
    `Content-Type: application/x-www-form-urlencoded`. Ohne `form`: **kein** Body, **kein**
    Content-Type.
12. **`normalizeBaseUrl`:** alle 18 Zeilen der Tabelle in Abschnitt 6.
13. **`mapOcsError`:** `kind: 'ocs'` mit Code in der Map -> gemappte ID; Code **nicht** in der Map
    -> `fallbackId`; `kind: 'auth'` mit einer Map, die `401` enthielte -> ID bleibt
    `falsche_zugangsdaten`, die Map wird **ignoriert**; `result.ok === true` -> wirft.
14. **`messages.js`:** jede der 13 neuen IDs hat den exakten Text aus Abschnitt 5. Vorwärtsrichtung
    wie in S02 — **keine** Prüfung auf unbenutzte IDs.
15. **Purity von `url.js`:** fällt unter den bestehenden ESLint-Override für `src/shared/**`.
    Zusätzlich der Spy-Test wie in S02.
16. `npm test` und `npm run lint` grün.

## Ausdrücklich NICHT in diesem Schritt

- **Kein `ocs/connection.js`**, keine `checkConnection()`. Das ist S04 zusammen mit dem Dialog.
- Kein `session.js`, kein `credentials.js`, kein `safeStorage`, keine Zertifikatsausnahme,
  kein `tls.js`. S03 **klassifiziert** Zertifikatsfehler nur, es behandelt sie nicht.
- Kein `ocs/users.js`, `ocs/groups.js`, `ocs/userList.js`. Keine Endpunkt-Maps — nur der
  Mechanismus `mapOcsError` plus eine Beispielmap **im Test**.
- Keine `users/details`-Probe, kein N+1-Fallback, kein `userView.js`, kein `quota.js`.
- Keine neuen IPC-Kanäle, keine Preload-Änderung, keine UI, keine Vue-Datei.
- Kein echter Netzwerkzugriff in Tests. `fetchImpl` wird injiziert.
- Keine neuen Abhängigkeiten.

## Fallen aus docs/REVIEW-NOTES.md, die hier besonders gelten

- **Punkt 1:** `OCS-APIRequest` auf **jedem** Request, auch beim späteren Verbindungstest.
- **Punkt 2:** HTTP 200 ist kein Erfolg. Beide Bedingungen prüfen.
- **Punkt 3:** Keine globale Statuscode-Tabelle. Maps gehören zu den Endpunkten.
- **Punkt 5:** `429` ist ein eigener Fehlerfall mit Backoff, nie ein User-Fehler.
- **Punkt 8:** Das App-Passwort verlässt den Main-Prozess nie — auch nicht in Fehlermeldungen.
- **`[S02]`-Einträge:** Grenzwerte tatsächlich einsetzen; Defaults an Eingaben prüfen, bei denen
  sie zählen; Mutationsbeweise nur gegen Kopien; bei „genau dann, wenn" beide Richtungen prüfen;
  Testname und Assertion müssen übereinstimmen.
