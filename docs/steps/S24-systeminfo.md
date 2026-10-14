# S24 Systeminfo absichern

## Anlass
Die Systeminfos im Dashboard (Host, OS, CPU, RAM, Uptime, Disk, externe IP) kamen ohne Spec und
Review in den Code. Laut Nutzerentscheidung (DECISIONS 2026-10-14 „Systeminfos im Dashboard")
bleiben sie, müssen aber abgesichert werden. Review-Befunde:
- `fetchText` schickt Basic-Auth mit `redirect: 'follow'` an eine HTML-Route und prüft nicht, ob
  die Antwort noch vom selben Origin kommt.
- `fetchText` liest den Body auch bei Fehlerstatus und hat einen nackten `catch` ohne Log.
- `src/shared/systemInfo.js` mischt einen HTML-Scraper, den nur Main nutzt, mit
  Renderer-Formatierung.
- Drei sequentielle Requests pro Dashboard-Refresh.
- ARCHITECTURE ist veraltet: `server.freeSpace` liefert jetzt `system`, `groups.list` liefert
  `{ id, displayname }[]`.

## Umsetzung
- `src/main/ocs/client.js` `fetchText`:
  - `redirect: 'manual'`. Einzige Prüfung bleibt `status < 200 || status >= 300` ->
    `{ ok: false, status }` (deckt 0/opaqueredirect, 3xx, 4xx, 5xx). Statusprüfung **vor**
    `text()`, Body nur bei 2xx lesen. Kein eigener Redirect-Zweig, keine Origin-Prüfung (es wird
    nichts verfolgt).
  - Produktion (Electron `net.fetch`): ein Redirect unter `manual` wirft
    `Error('Redirect was cancelled')` und landet im `catch`; undici-artige Mocks liefern die
    3xx-Antwort. Beides -> `ok: false`, kein zweiter Request. Eine Logzeile pro Refresh ist
    akzeptiert (DECISIONS „Konsolen-Logging“).
  - `catch` loggt `console.error('fetchText failed:', describeError(error, [appPassword]))` und
    liefert `{ ok: false, status: null }`. Header und Timeout-Signal wie heute.
- Modul-Split (beide pur, ohne I/O), nur Verschieben, nichts Neues:
  - `src/main/ocs/serverInfoPage.js` (nur Main): `parseServerInfoPage`, `isPublicIp`,
    `systemSnapshot`, `formatUptime` samt privaten Helfern.
  - `src/shared/systemInfo.js` behält nur `systemZeilen` und dessen private Helfer
    (`festplatte`, `NICHT_VERFUEGBAR`).
  - `src/main/ocs/serverInfo.js` importiert aus `./serverInfoPage.js`.
  - Tests: `tests/serverInfoPage.test.js` (neu, für das neue Modul) und `tests/systemInfo.test.js`
    (Rest), jeder Fall genau einmal. Das bestehende synthetische `PAGE` aus
    `tests/systemInfo.test.js` wandert nach `tests/fixtures/serverinfo-page.html`; das Inline-HTML
    in `tests/ocsGroups.test.js` (~:206) nutzt dieselbe Fixture (keine zwei Kopien).
- `src/main/ocs/serverInfo.js` `getServerInfo`: `basicdata` und Admin-Seite **parallel**
  (`Promise.all`), erst nachdem `info` ok war. Scheitert eines, fehlen nur dessen Felder.
- Parser wirft bei keiner Eingabe.
- `docs/ARCHITECTURE.md`: IPC-Tabelle `server.freeSpace` -> `{ ok, freeBytes, system }` mit
  Feldliste; `GroupView`-Typdefinition auf `{ id, displayname }` prüfen/korrigieren; Modulliste um
  `serverInfoPage.js`; ein kurzer Absatz zu Herkunft der Systeminfos (serverinfo-API, Admin-Seite,
  DNS) und Fehlerverhalten. (Import-Teil der Doku wurde bereits in S20 aktualisiert.)
- `docs/MANUAL-TEST.md`: neuer Fall mit Buchstabensuffix — gegen die echte Nextcloud zeigt das
  Dashboard nach S24 weiterhin Hostname/OS/CPU (sonst leitet der Server die Admin-Seite um).

## Akzeptanz
1. `fetchText` mit gemocktem `fetchImpl`: Aufruf mit `redirect: 'manual'`, Header
   `Authorization: Basic …` und `signal`. Für jede der drei Formen (a) `{ status: 302, Location }`,
   (b) `{ status: 0, type: 'opaqueredirect' }`, (c) `fetchImpl` rejectet mit
   `new Error('Redirect was cancelled')` (-> `status: null`): `ok: false`, `fetchImpl` genau
   einmal, `text()` nicht aufgerufen. 500 -> `ok: false`, `text()` nicht aufgerufen.
2. `fetchImpl` wirft `new Error('boom geheim')` (Testclient-Passwort `geheim`):
   `{ ok: false, status: null }`; `console.error` (per `vi.spyOn`, danach restore) aufgerufen; kein
   Argument enthält `geheim` oder das Base64 von `admin:geheim`.
3. `parseServerInfoPage` wirft für keine dieser Eingaben: `''`, `'<html></html>'`, `null`, `42`,
   die halbierte Fixture, `'server-info-wrapper'` allein. Ergebnis ist `null` oder ein Objekt mit
   genau den 7 Schlüsseln (`hostname`, `betriebssystem`, `prozessor`, `ip`, `diskMount`,
   `diskFreeBytes`, `diskTotalBytes`), jeder Wert String, Zahl oder `null`. Die volle Fixture
   liefert die bisher erwarteten Werte exakt.
4. `getServerInfo` (in `tests/ocsGroups.test.js` bei den bestehenden Fällen):
   info ok, basicdata 500, Seite 302 -> `ok: true`, `freeBytes` gesetzt, `system.uptime === null`,
   `system.hostname === null`, `system.ramBytes`/`prozessor` aus `info`.
   info 401 -> `fetchImpl` genau einmal aufgerufen.
5. `systemZeilen(null)`: jede Zeile „nicht verfügbar“.
6. `grep -rn "serverInfoPage" src/renderer src/shared` leer; `src/main/ocs/serverInfo.js`
   importiert nichts mehr aus `../../shared/systemInfo.js`.
7. `npm test`, `npm run lint`, `npm run build` grün.

## Nicht im Scope
- Neue Systemfelder, andere Quellen, Caching.
- OCS-`request()` behält `redirect: 'follow'` (bewusst; OCS-Routen leiten nicht um, Fehlerfälle
  sind über die Envelope-Prüfung abgedeckt).
- CI/Fenster (S25).
