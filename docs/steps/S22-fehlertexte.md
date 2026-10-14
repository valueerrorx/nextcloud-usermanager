# S22 Fehlertexte nur aus messages.js (Ausnahme Passwortrichtlinie)

## Anlass
Review der Commits nach S18: Servertexte (`ocs.meta.message`, `ocs.data.message`) wandern als
`hinweis` in `ItemResult.grund`, damit in UI und Ergebnis-CSV; `actions.run` gibt
Exception-Text über IPC zurück. Beides verletzt DECISIONS „`message` kommt immer aus
`messages.js`“ und die Secrets-Regel aus CLAUDE.md.

## Entscheidungen (DECISIONS 2026-10-14)
- Servertext nur bei OCS **107** (Passwortrichtlinie) auf Passwort setzenden Schritten
  (`user.create` inkl. Import, `user.setPassword`), bereinigt. Sonst nur `messages.js`.
- Kein Exception-Text über IPC.
- Konsolen-Logging auch in der gebauten App (geschwärzt, keine Datei) — bleibt wie heute.
- Renderer-Dialoge: deutsche Meldung + Detail klein im Fuß (`unerwartetFooter`) — bleibt.

## Umsetzung
- `src/main/ocs/client.js`: `makeFailure` setzt kein pauschales Textfeld mehr. Nur bei
  `meta.statuscode === 107` hängt der Client den bereinigten Servertext als `serverText` an.
  Ist das zu setzende Passwort (`form.password` bzw. `form.value` bei `key=password`) kürzer als
  4 Zeichen, gibt es **kein** `serverText` (die Bereinigung kann so kurze Secrets nicht sicher
  entfernen). Der `'http'`-Zweig verliert den `HTTP <status>`-Fallback und jedes Textfeld.
  Umbenennen: `sanitizeHinweis` -> `sanitizeServerText`, `USELESS_HINWEIS` -> `USELESS_SERVER_TEXT`.
- `src/main/ocs/errors.js` (`mapOcsError`) bleibt; es reicht Zusatzfelder per Spread durch.
- `src/main/actions/operations.js`: Flag `setsPassword: true` am `create`-Schritt von
  `user.create` und am Schritt von `user.setPassword` (die einzige Stelle, die festlegt, welche
  Schritte passwortsetzend sind; nie über Step-Namen, die können Gruppen-IDs sein).
- `src/main/actions/pipeline.js`: Helper `fehlerGrund(step, result)`, genutzt in beiden
  Fehlerzweigen (~Z. 36 und ~Z. 62): `step.setsPassword && result.ocsCode === 107 &&
  result.serverText` -> `` `${MESSAGES.passwort_policy} (${result.serverText})` ``, sonst
  `result.messageId`.
- `src/main/ipc.js` äußerer `actions.run`-Catch (~Z. 256-263): Rückgabe exakt
  `{ ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler }`;
  `detail` nur ins `console.error` (geschwärzt wie heute).
- `src/renderer/views/ImportView.vue` ~Z. 224: `text: MESSAGES.unerwarteter_serverfehler`,
  Detail über `footer: unerwartetFooter(error)` wie in `jobRunner.js`.
- `UsersView.vue:188` (Inline-Meldung) und `ActionBar.vue:193` (Toast): **unverändert** — reine
  Renderer-Fehler, Renderer hält keine Secrets (DECISIONS „Technisches Detail in Fehlerdialogen“).
- `jobReport.js`/`resultCsv.js` unverändert: `resolveGrund` reicht Nicht-IDs unverändert durch.
- `docs/ARCHITECTURE.md` §5 (~Z. 377): ItemResult `grund` = messageId, oder bei 107 auf einem
  passwortsetzenden Schritt `MESSAGES.passwort_policy (Servertext)`; `resolveGrund` reicht Nicht-IDs
  durch. Failure-Form: optionales `serverText` nur bei 107.
- Bestehende Tests, die **angepasst** (nicht abgeschwächt) werden:
  `tests/ocsClient.test.js` ~:431, ~:434-441, ~:459-468 (`hinweis` -> `serverText`, nur 107),
  ~:443-450 (HTTP 500 ohne Textfeld), ~:452-457 (`HTTP 500`-Fallback-Test invertieren);
  `tests/pipeline.test.js` ~:359-377 (`user.enable` mit Servertext: `grund` ist die messageId);
  `tests/ipc.test.js` ~:840 (exakter MESSAGES-Text statt `expect.any(String)`).

## Akzeptanz
Kriterien 1-5 laufen **Ende-zu-Ende**: echter `createOcsClient` mit gemocktem `fetchImpl`, echte
`users.js`/`operations.js`, `runJob`. Kein Stub von `client.request`.
1. `POST /cloud/users` antwortet `statuscode 107`, `message: "Das Passwort ist zu kurz. Pa55wort"`,
   Form-Passwort `Pa55wort`: `grund === \`${MESSAGES.passwort_policy} (Das Passwort ist zu kurz.)\``.
2. Dasselbe für `user.setPassword` (PUT `key=password`, Wert `Pa55wort`) mit 107.
3. 102 auf `user.create` und 101 auf `user.setQuota`, jeweils mit Servertext `"geheim: xyz"`:
   `grund` ist exakt die gemappte messageId; das Client-Failure hat **kein** `serverText`
   (`not.toHaveProperty('serverText')`); `JSON.stringify(item)` enthält `geheim` nicht.
4. 107 auf `user.setQuota` (nicht passwortsetzend) und auf einem Gruppenschritt mit Gruppe
   `password`: `grund` ist die messageId, kein Servertext.
5. HTTP 500 mit Envelope `statuscode 100`, `meta.message: "interner Text"`:
   `grund === 'unerwarteter_serverfehler'`; `JSON.stringify(item)` enthält weder `interner Text`
   noch `HTTP 500`.
6. Passwort `abc`, 107 mit `"abc zu kurz"`: `grund === MESSAGES.passwort_policy` exakt
   (ohne Klammer), kein `serverText`.
7. Äußerer `actions.run`-Catch (Auslösung wie tests/ipc.test.js ~:835-844 per werfendem
   `args`-Getter), Exception-Message enthält das Session-App-Passwort (`geheim`) und `boom`:
   Ergebnis `toEqual({ ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler })`;
   `console.error` aufgerufen, kein Argument enthält `geheim`.
8. `grep -rni "hinweis" src/main` leer.
9. ImportView-Fehlerdialog: manueller Check in docs/MANUAL-TEST.md (neuer Fall mit
   Buchstabensuffix) — kein Quelltext-Regex-Test.
10. `npm test`, `npm run lint`, `npm run build` grün.

## Nicht im Scope
- Batch/IPC-Robustheit (S23), Systeminfo (S24), CI (S25).
- Änderung am Konsolen-Logging oder an `unerwartetFooter`.
