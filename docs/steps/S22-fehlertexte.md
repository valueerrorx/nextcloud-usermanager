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
- `src/main/ocs/client.js`: `makeFailure` setzt `hinweis` **nicht** mehr pauschal. Stattdessen
  wird der bereinigte Servertext nur bei `meta.statuscode === 107` als Feld `serverText`
  an das Failure gehängt; alle anderen Fälle haben kein Textfeld. Der `'http'`-Zweig verliert den
  `HTTP <status>`-Fallback (Status steht bereits in `httpStatus`).
  `sanitizeHinweis` bleibt für den 107-Fall (Secrets inkl. `form.password`/`form.value` werden
  entfernt; Länge gekappt) und wird in `sanitizeServerText` umbenannt.
- `src/main/actions/pipeline.js`: `grund` ist immer die `messageId`, außer: Schritt ist
  passwortsetzend (`create` bzw. `password`), `ocsCode === 107` und `serverText` vorhanden ->
  `grund = \`${MESSAGES.passwort_policy} (${serverText})\``. Welche Schritte passwortsetzend sind,
  steht als benannte Menge der Step-Namen in `pipeline.js` oder `operations.js` (eine Stelle).
- `src/main/ipc.js` `actions.run`-Catch (~Z. 257-262): Rückgabe nur
  `MESSAGES.unerwarteter_serverfehler`, `detail` nur ins `console.error`.
- `src/renderer/views/ImportView.vue` ~Z. 224: Detail nicht im `text`, sondern über
  `footer: unerwartetFooter(error)` wie in `jobRunner.js`.
- `jobReport.js`/`resultCsv.js` unverändert (`resolveGrund` löst messageId oder Text auf).
- docs/ARCHITECTURE.md: Fehlerfluss-Abschnitt (Failure-Form, `grund`) nachziehen.

## Akzeptanz
1. Gemockter Server antwortet auf `POST /cloud/users` mit `statuscode 107` und
   `message: "Das Passwort ist zu kurz. Pa55wort"` (Form-Passwort `Pa55wort`): Item-`grund`
   beginnt mit dem deutschen `passwort_policy`-Text, enthält „Das Passwort ist zu kurz.“ und
   **nicht** `Pa55wort`.
2. Dasselbe für `user.setPassword` (PUT `key=password`) mit 107.
3. Ein anderer OCS-Fehler (z. B. 102 auf `user.create`, 101 auf `user.setQuota`) mit Servertext
   `"geheim: xyz"`: `grund` ist exakt die gemappte `messageId`, Servertext taucht in keinem
   ItemResult-Feld auf.
4. 107 auf einem **nicht** passwortsetzenden Schritt (z. B. `user.setQuota`): kein Servertext.
5. HTTP-5xx-Antwort mit OCS-Envelope und Text: `grund` = `unerwarteter_serverfehler`
   (bzw. die bestehende messageId), kein `HTTP 500`-String, kein Servertext.
6. `actions.run`, dessen Pipeline eine Exception wirft, deren Message das App-Passwort und
   `TypeError: boom` enthält: IPC-Rückgabe `message === MESSAGES.unerwarteter_serverfehler`
   exakt; `console.error` wurde aufgerufen.
7. `grep -rn "hinweis" src/main` leer (Feld umbenannt/entfernt).
8. `npm test`, `npm run lint`, `npm run build` grün.

## Nicht im Scope
- Batch/IPC-Robustheit (S23), Systeminfo (S24), CI (S25).
- Änderung am Konsolen-Logging oder an `unerwartetFooter`.
