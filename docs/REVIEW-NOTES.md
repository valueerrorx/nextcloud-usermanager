# Review-Notes

Wiederkehrende Fehlerquellen in diesem Projekt.
**Coder:** vor dem Implementieren lesen, diese Fehler nicht machen.
**Senior-Reviewer:** den Diff explizit gegen jeden Punkt prüfen.
**Lead:** nach jedem `RECURRING`-Befund hier ergänzen.

Die Startpunkte 1-10 sind nicht aus Reviews, sondern aus dem Research belegt
(`docs/RESEARCH-OCS.md`, `docs/RESEARCH-UPN.md`). Sie sind trotzdem bindend.

## Nextcloud-API
1. **`OCS-APIRequest: true` fehlt.** Der Header ist auf *jedem* Request Pflicht, sonst antwortet Nextcloud mit einem Redirect/HTML statt mit OCS. Nie vergessen, auch nicht beim Verbindungstest.
2. **HTTP 200 ist kein Erfolg.** Der echte Status steht in `ocs.meta.statuscode`. Immer beide prüfen: HTTP-Status *und* `meta.statuscode`.
3. **Statuscodes sind endpunkt-spezifisch.** `101` bedeutet beim Anlegen etwas anderes als beim Bearbeiten, `102` bei Gruppe-anlegen etwas anderes als bei User-anlegen. **Keine globale Lookup-Tabelle** für Code-zu-Meldung. Pro Endpunkt mappen.
4. **Quota-Werte sind inkonsistent.** Unbegrenzt kommt als `"none"` *oder* `-3`. Bei Usern ohne ersten Login können `free`/`total` `null` oder abwesend sein. Nie naiv `parseInt` oder arithmetisch summieren, ohne diese Fälle vorher abzufangen.
5. **`429 Too Many Requests` ist ein eigener Fehlerfall**, kein User-Fehler. Gehört in einen Backoff, darf im Batch-Ergebnisbericht nicht als "User fehlgeschlagen" gezählt werden.
6. **User-IDs case-insensitiv vergleichen.** Nextcloud behandelt Groß-/Kleinschreibung selbst inkonsistent. Jede Kollisions- und Existenzprüfung normalisiert vorher.

## Secrets und Electron
7. **`safeStorage` kann still auf Klartext zurückfallen.** Auf Linux ohne laufenden Keyring liefert `getSelectedStorageBackend()` `basic_text`, und die Daten sind praktisch unverschlüsselt. Vor dem Speichern `isEncryptionAvailable()` prüfen und den Nutzer bei `basic_text` im UI warnen. Niemals stillschweigend speichern.
8. **Das App-Passwort darf den Main-Prozess nie verlassen.** Nicht in IPC-Rückgaben, nicht in Logs, nicht in Fehlermeldungen, nicht in Exceptions, nicht in exportierten CSVs. Auch nicht teilmaskiert.
9. **Initialpasswörter nicht loggen.** Sie dürfen ausschließlich in den Ergebnis-CSV-Export des Imports, sonst nirgends.
10. **Electron-Security-Flags nicht abschalten.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` sind Defaults aktueller Electron-Versionen — sie müssen so bleiben. Preload exponiert eine schmale, explizit aufgelistete API, keinen generischen `invoke(channel, ...)`-Durchgriff.

## Username-Generator
11. **Nur die JS-Variante aus `src/utils/upn.js` ist autoritativ.** Die PowerShell-Variante im Referenzprojekt weicht ab und ist nicht die Vorlage.
12. **Die Split-Heuristik an `/[-\s]/` aus den Remove-Views gehört nicht in die Erzeugung.** Sie ist Fuzzy-Matching für das Löschen. Bindestriche und Leerzeichen werden bei der Erzeugung ersatzlos gelöscht.

## Reviews
<!-- Ab hier: Befunde aus echten Reviews. Format: - [S<nn>] <Datei> - <Muster> -->
- [S01] `src/main/index.js`, `src/renderer/App.vue`, `scripts/dev.mjs` — **unbehandelte Promise-Rejections**, fünf Stellen in einem Schritt. `loadURL`/`loadFile`, `app.whenReady().then()`, ein `async` Funktionsaufruf ohne `.catch()`, `onMounted(async …)`. Jede davon endet in einem stillen Totalausfall ohne Diagnose. **Jede Promise wird awaited oder gecatcht, ohne Ausnahme.**
- [S01] `tests/skeleton.test.js` — **Regex-Assertions auf Quelltext sind kein Sicherheitstest.** Ein Preload-Durchgriff `invoke: (channel, ...args) => …` hat die Prüfung „exponiert genau ein Feld" passiert, weil die Regex nur argumentlose Arrow-Functions traf. Sicherheitszusagen werden **verhaltensbasiert** geprüft: Modul laden, `electron` stubben, `Object.keys(api)` vergleichen.
- [S01] `tests/skeleton.test.js` — Eine Assertion auf die **exakte** Menge der devDependencies wird in einem Folgeschritt fälschlich rot. Verbotenes aufzählen, nicht Erlaubtes.
- [S01] `electron-builder.yml` — `files`-Whitelist ohne `!node_modules/**`: Vue und SweetAlert2 sind schon von Vite gebündelt und landen doppelt im Artefakt.
- [S01] `tests/mainWindow.test.js` — **bedingte Tests** (`if (featureVorhanden) { it(...) }`) sind verboten. Sie halten die Suite grün und senken bei entferntem Feature nur lautlos die Testanzahl. Fehlt das Feature, muss der Test fehlschlagen. Gleiche Fehlerklasse wie die Regex-Assertion: ein Test, der durch Nicht-Laufen besteht.
- [S01] `eslint.config.js` — ein grünes Lint ist kein Beweis für Abdeckung. Ohne `eslint-plugin-vue` übersprang ESLint alle sechs `.vue`-Dateien stillschweigend und meldete trotzdem Erfolg. **Bei jeder Lint-/Testkonfiguration prüfen, welche Dateien tatsächlich erfasst werden** (`eslint . --debug`), nicht nur den Exitcode.
- [S01] `src/main/windowOptions.js` — **Event-Signaturen gegen `node_modules/electron/electron.d.ts` prüfen, nicht raten.** `will-frame-navigate` liefert ein einzelnes `details`-Objekt, `will-navigate` positionale `(event, url)`. Die kopierte Signatur machte den Vergleich zu totem Code; `preventDefault()` feuerte bedingungslos. Fiel nur auf, weil ein Reviewer die Typdefinition nachgelesen hat.
- [S01] Eine Sicherheitsentscheidung liegt **einmal** im Code. Die Deny-Logik war pro Listener kopiert — genau dort driftete sie auseinander. Zwei Listener, ein gemeinsamer Helfer.
- [S01] `tests/skeleton.test.js` — **zweite** Verletzung der Regel „Verbotenes aufzählen, nicht Erlaubtes": eine Assertion auf *genau* drei Dateien in `src/main/` wird rot, sobald die Architektur dort planmäßig weitere Module vorsieht. Verzeichnisinhalte nie als exakte Allowlist prüfen.
- [S02] **Testname und Assertion müssen übereinstimmen.** Vier Tests in einem Schritt behaupteten im Namen mehr als sie prüften: eine „Kürzung"-Prüfung, die im Nicht-Kürzungs-Zweig landete; ein „Default-Wert"-Test, der für jeden Default grün bleibt; ein Reihenfolge-Test mit zwei identischen Objektliteralen; eine `if (result.gekuerzt)`-Assertion, die bei stets falschem Flag verdampft. **Beim Schreiben eines Grenzwerttests den Grenzwert tatsächlich einsetzen** — `budget === 1`, nicht `budget === 16`.
- [S02] **Defaults müssen an Eingaben geprüft werden, bei denen der Default zählt.** Ein Test mit `max`-Default, dessen Eingaben für jeden Wert >= 11 durchlaufen, beweist nichts.
- [S02] **Jede Konstante einer Verbotsliste muss auch durch den Validator geschickt werden.** `RESERVED_USERIDS` war nur als „Array mit 8 Strings" geprüft; 6 der 8 wurden nie tatsächlich abgelehnt.
- [S02] `eslint.config.js` — `no-restricted-globals` sieht `globalThis.fetch(...)` **nicht**. Die Regel ist eine Hürde, keine vollständige I/O-Sperre; der verhaltensbasierte Spy-Test bleibt nötig.
- [S02] **Mutationsbeweise nie an der echten Quelle durchführen.** Ein Tester hat beim Mutieren `src/shared/username.js` überschrieben statt eine Kopie, es selbst bemerkt und zurückgesetzt. Richtig ist: Kopie in ein Scratch-Verzeichnis, Import im Test auf die Kopie umbiegen, Original **nie** anfassen. Der Lead verifiziert die kritischen Zeilen danach unabhängig.
- [S02] **Die Invariante am Grenzwert war in der Spec falsch**, nicht im Code: „`total === max` genau dann, wenn `gekuerzt: true`" gilt bei exakter Passung (`budget === second.length`) nicht. Gefunden nur durch Mutationstest. **Bei jeder „genau dann, wenn"-Zusicherung beide Richtungen prüfen** — die Umkehrung ist oft falsch.
- [S02] **Testanzahl ist kein Qualitätsmaß.** 223 grüne Tests, und zwei Mutanten überlebten. Bei sicherheits- oder korrektheitsrelevanten Zusicherungen zählt der Mutationsbeweis, nicht die Zahl.
- [S03] **Jeder Schritt, der ein neues Verzeichnis oder Modul anlegt, muss die S01-Scope-Guards mitpflegen.** Zweimal passiert: S02 musste den `src/shared/`-Block in `tests/skeleton.test.js` löschen, S03 `'ocs'` aus der Verbotsliste nehmen. **Der Lead schreibt das in die Step-Spec**, sonst stolpert der Coder darüber oder die Suite wird ohne Erklärung rot.

## Arbeitsweise ab S03 (Tech-Lead, 2026-10-07)
Schlanker Modus, auf Wunsch des Nutzers. Begründung: die Tests kosten nichts (Suite ~450 ms),
aber die Agent-Schleifen kosten viel. S01 brauchte 11 Durchläufe, S02 neun.
- **Coder und Tester in EINEM Durchlauf**, nicht sequenziell.
- **EIN Review pro Schritt.** `MINOR`-Befunde werden notiert, nicht behoben. Eine zweite Runde
  nur bei `CRITICAL`.
- **spec-critic nur bei Schritten mit echtem Entwurfsanteil**, nicht bei mechanischen.
- **Mutationsbeweis nur noch für:** Secrets/Secret-Leaks, Electron-Security-Flags und die
  1:1-Port-Korrektheit. **Nicht** für jeden Default und jeden Grenzwert.
- **Zielgröße ~25 Tests pro Schritt**, nicht 150. Jedes Abnahmekriterium einmal, plus echte
  Grenzwerte. Keine tabellengetriebene Aufblähung.
- **Step-Specs kurz halten** — die S03-Spec hatte 230 Zeilen für ein 140-Zeilen-Modul.
Die Mutationsbeweis-Technik bleibt, weil sie real Bugs gefunden hat, die grüne Suiten nicht
fanden (`budget >= 2` in S02, der `??`-Bug in S03). Nur die Breite wird reduziert.
