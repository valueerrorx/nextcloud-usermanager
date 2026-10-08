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

- [S03] **Eine Sicherheitszusage muss gegen JEDE Darstellung des Secrets prüfen.** Der Leak-Test suchte nur den Klartext des Passworts — `message: err.message` hätte ihn passiert, weil im Authorization-Header die **base64**-Form steht. Gleiche Schwäche wie die Quelltext-Regex aus S01: die Zusicherung sieht geprüft aus und ist es nicht.
- [S03] **Muss der Code zwischen zwei widersprüchlichen Spec-Sätzen wählen, gehört das in den Schrittbericht**, nicht nur in einen Code-Kommentar. Hier: „HTTP 5xx -> GET -> 1 Retry" gegen „bei `notOcs` wird nie wiederholt". Ein echter 502 liefert HTML, ist also `notOcs` — die Retry-Regel war dadurch fast unerreichbar.
- [S03] **Verdrahtung wird getestet, nicht nur Logik.** Das Löschen von `signal: AbortSignal.timeout(...)` ließ alle 287 Tests grün, während ein echter Request ewig hängen würde. Bei jedem Mechanismus, der nur über ein Options-Objekt wirkt, mindestens eine Assertion auf das übergebene Objekt.
- [S03] **Lead: `git add -A` nie in einem `docs:`-Commit.** So ist der komplette S03-Quellcode in einem docs-Commit gelandet und der Schritt in `git log` unsichtbar. Quelle und Dokumentation getrennt committen.

- [S04] **Ein Mutationsbeweis ist eine Entwicklungs-Tätigkeit, kein Test für die Suite.** In S04 landeten zwei Tests im Bestand, die zur Laufzeit eine Datei nach `/tmp` kopieren, dort den Fehler einbauen und dann behaupten, die kaputte Kopie sei kaputt. Das ist immer grün und sagt nichts über den echten Code. **Richtig:** die Mutation einmal beim Entwickeln fahren, belegen, dass die **echte** Assertion rot wird, und nur die echte Assertion in der Suite lassen. Kein Dateisystem-Schreiben während `npm test`.

- [S04] **Wird der HTTP-Stack getauscht, verfällt die darauf zugeschnittene Fehlerklassifikation.** `CERT_CODES` in `client.js` enthielt OpenSSL-Strings (`SELF_SIGNED_CERT_IN_CHAIN`) für Node/undici. Mit dem Wechsel auf Electrons `net.fetch` wirft Chromium `net::ERR_CERT_*` — ein untrustworthy Zertifikat wurde dadurch als „Server nicht erreichbar" gemeldet. **Lead-Fehler:** den Stack gewechselt, die Klassifikation nicht mitgezogen.
- [S04] **Zustände, die das UI anzeigen soll, müssen dort landen, wo das UI sie liest.** Die akzeptierte Zertifikatsausnahme lag nur in der Controller-Closure; `connection.status.certException` war immer `null`, und das Warnbanner verschwand im Hauptablauf wieder. Eine Sicherheitswarnung, die der Nutzer nicht sieht, ist keine.
- [S04] **Für Zertifikatsergebnisse ist der Verifier die Autorität, nicht die Fetch-Fehlermeldung.** Statt Fehlerstrings zu parsen, fragt der Verbindungsaufbau den TLS-Controller, was mit dem Zertifikat dieses Hosts entschieden wurde. Deterministisch und unabhängig vom HTTP-Stack.

- [S05] **„Was passiert hier bei 429?" gehört in jede Spec, die einen Fehlerpfad definiert.** Die Regel ist jetzt dreimal verletzt worden, jedes Mal anders verkleidet: in S03 als fehlender eigener Fehlerfall, in S04 beim Stack-Wechsel, in S05 als Fallback-Auslöser mit Verstärkungseffekt (ein 429 schaltete die Sitzung dauerhaft auf N+1 und feuerte danach hunderte Requests gegen den drosselnden Server). Einmal aufschreiben genügt offensichtlich nicht.
- [S05] **Bei einer Formel reicht es nicht, den falschen Weg auszuschließen — der richtige muss positiv belegt sein.** Ein Mutationstest belegte, dass `relative` ignoriert wird, aber nicht, dass die eigene Prozentrechnung stimmt: ohne `* 100` blieben alle 13 Quota-Tests grün, und die „fast voll"-Liste über 90 % hätte nie ausgelöst.
- [S05] **Eine Liste von Auslösern in der Spec ist abschließend zu lesen.** „Genau diese fünf Trigger" wurde als „jeder Fehler" implementiert, weil alle Fehler dieselbe Form (`!ok`) haben. Specs müssen den Negativfall ausdrücklich nennen: *jeder andere Fehler tut X*.

- [S06/S07] **Lead: vor jeder Mutation den Code greppen, nie das Muster raten.** Dreimal hat ein `sed`/Regex-Muster nicht gegriffen, weil der Code anders aussah als vermutet (`>= 50 &&` fehlte; `shouldStop?.()` war `shouldStop && shouldStop()`). Ergebnis: „Mutation überlebt" gemeldet, obwohl nie mutiert wurde. **Pflicht: Trefferzahl der Ersetzung ausgeben, Syntax des Mutanten prüfen, Kontrollfall mitlaufen lassen.**
- [S06] **Lead: Mutationsläufe selbst validieren.** Zwei meiner Mutationen in S06 waren ungültig: eine traf das `sed`-Muster nicht (Code sah anders aus als vermutet), die andere erzeugte einen Parse-Fehler. Ein zerstörter Mutant meldet „1 failed" — das sieht aus wie ein erfolgreich getöteter Mutant, ist aber nur eine nicht ladbare Datei. **Immer: Syntax des Mutanten prüfen, Kontrollfall mitlaufen lassen, und die Trefferzahl des `sed` verifizieren.**
- [S06] **Ein geänderter Locale-Tag ist keine Mutation für `localeCompare`.** `localeCompare(x, 'en-US')` sortiert Umlaute genauso brauchbar wie `'de'`. Der relevante Fehler ist der naive `<`-Vergleich — nur der muss rot werden.

- [S06] **Jede abgeleitete Liste gehört in ein pures Modul, auch die scheinbar triviale.** `gruppenOptionen` (Set über alle `UserView.groups`, sortiert) stand in `UsersView.vue` — mit dem einzigen `localeCompare` außerhalb von `filters.js` und ohne Tests. GroupsView und ImportView brauchen dieselbe Ableitung. **Faustregel: sobald in einer `.vue`-Datei `Set`, `sort`, `filter`, `reduce` oder `localeCompare` steht, gehört es nach `src/shared/`.**
- [S06] **Ein tragendes Prädikat darf nur einmal existieren.** „Sind alle sichtbaren Zeilen ausgewählt?" war zweimal unabhängig implementiert — in `UserTable.vue` für die Kopf-Checkbox und in `UsersView.vue` für `onToggleAlle`. Auf dieser Invariante stützt S08 die eingetippte Bestätigungszahl beim Batch-Löschen. Zwei Kopien driften.
- [S06] **`watch` ohne `immediate: true` ist keine Invariante.** Die Auswahl wurde nur beschnitten, solange die View montiert war und sich die Identität des `computed` änderte — ein *fehlgeschlagener* Reload ließ die alte Auswahl stehen.

- [S07] **Fortschritt ist eine zeitliche Zusicherung, keine Zählzusicherung.** `onProgress` wurde erst **nach** `await runPool(...)` in einer Schleife gefeuert: zehn Items, zehn Events, `done` lief 1..10 — formal „nach jedem Item", praktisch alles am Ende. Bei 120 Usern keine Rückmeldung während des Laufs. **Testbar nur zeitlich: mindestens ein Event muss eintreffen, bevor die Funktion auflöst.**
- [S07] **„Nie global fehlerhaft" heißt auch: wirft nie.** Eine unbekannte Action-ID flog als Exception aus `actions.run` heraus und machte den invoke-Kanal rejectend, obwohl ARCHITECTURE §3 das ausschließt. Programmierfehler dürfen im Main-Prozess werfen, aber nicht über die IPC-Grenze.
- [S07] **„Kein Request" muss am Request gemessen werden, nicht am Status.** Ein Item kann `nicht ausgeführt` tragen und trotzdem einen Request abgesetzt haben. Die Assertion gehört an den Request-Zähler bzw. das gemockte `fetchImpl`.

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
