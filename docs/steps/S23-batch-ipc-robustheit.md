# S23 Batch/IPC-Robustheit

## Anlass
Review der Commits nach S18 (MAJOR/MINOR-Befunde):
- Ein Item ohne Schritte (z. B. `user.removeFromGroup` mit leerem/fehlendem
  `groupidsByUserid[userid]` und ohne `groupid`, oder `user.update` ohne Felder) wird in
  `runSteps` als `ok` verbucht, ohne dass ein Request lief (REVIEW-NOTES S07/S08: kein „ok“ ohne Tat).
- Main prüft die Einträge von `groupidsByUserid` nicht.
- `groups.rename`: `groupid.trim()` auf Nicht-String wirft und wird als
  `unerwarteter_serverfehler` gemeldet statt als Validierungsfehler.
- `operations.js`/`pipeline.js` bauen deutsche Sätze mit interpolierter Gruppen-ID im Main
  statt über `messages.js`.
- `RENAME_GROUP_ERRORS` mappt `404`; über `/ocs/v1.php` kommt eine fehlende Gruppe vermutlich als
  OCS-`statuscode 998`, dann ist `gruppe_existiert_nicht` unerreichbar.

## Umsetzung
- `src/main/actions/pipeline.js` `runSteps`: leere Schrittliste -> `status: 'nicht ausgeführt'`,
  `grund: 'nichts_auszufuehren'`, `httpStatus: null`, `ocsCode: null`, kein Request. Neuer Text in
  `messages.js`: `nichts_auszufuehren: 'Für diesen Benutzer gab es nichts auszuführen.'`. Zählt in
  der Summary als `nichtAusgefuehrt`.
- `src/main/actions/operations.js` `gruppenZumEntfernen`:
  - Ist `groupidsByUserid[userid]` ein Array, gilt **nur** dieses (kein Rückfall auf
    `params.groupid`, auch wenn nach dem Filtern nichts übrig bleibt).
  - Gefiltert werden Einträge, die Strings und nach `trim()` nicht leer sind; gesendet wird der
    **unveränderte** Original-String (Gruppen-IDs kommen wörtlich vom Server).
  - Doppelte Einträge werden entfernt (erste Vorkommen, Reihenfolge bleibt).
  - Kein Array und `groupid` kein nicht-leerer String -> leere Liste.
- `src/main/ipc.js`: `typeof groupid !== 'string'` oder leer nach Trim -> Validierungsfehler statt
  Wurf, in allen vier Handlern mit ihrer bestehenden messageId: `groups.rename`, `groups.delete`,
  `groups.members` -> `gruppenname_leer`; `groups.create` -> `gruppe_anlegen_fehlgeschlagen`.
- Teilfehler-Sätze nach `src/shared/messages.js` als exportierte Funktionen **neben** dem
  eingefrorenen `MESSAGES` (das bleibt reine Strings): `teilfehlerGruppeZuweisen(groupid)`,
  `teilfehlerGruppeEntfernen(groupid)`, `teilfehlerSchritt(name)`, exakt die heutigen Texte.
  `operations.js` und `pipeline.js` (`teilfehlerGrund`) rufen nur noch diese. Kein generischer
  Template-Helfer.
- `src/main/ocs/groups.js` `RENAME_GROUP_ERRORS`: vor der Änderung im Nextcloud-Quellcode belegen
  (URL, Zeile **und** Branch/Version im Bericht), welchen OCS-Statuscode
  `PUT /ocs/v1.php/cloud/groups/{gid}` für eine fehlende Gruppe liefert (erwartet 998 über
  `GroupsController::updateGroup` + v1-Abbildung). `404` durch den belegten Code ersetzen.
  `tests/ocsGroups.test.js` ~:154-158 auf den belegten Code **umstellen** (kein zweiter Test);
  ~:176 optional auf 998.
- Doku/Kommentare: `src/shared/jobReport.js` ~:6-9 (grund bei 'nicht ausgeführt' ist `null` bei
  Abbruch, `nichts_auszufuehren` bei leerer Schrittliste). `docs/ARCHITECTURE.md` §5: dasselbe
  im ItemResult; die Nicht-messageId-Fälle von `grund` sind 107-Passwortrichtlinie **und** die
  `teilfehler*`-Sätze; ‚teilweise‘ entsteht auch bei `user.removeFromGroup`.

## Akzeptanz
Für 1-3: echter `createOcsClient` mit injiziertem gemocktem `fetchImpl`, gezählt wird am
`fetchImpl`.
1. `runJob` mit `user.removeFromGroup`, `params.groupidsByUserid = { a: [], b: undefined }`, ohne
   `groupid`, Items `a`, `b`, `c`: alle drei `status: 'nicht ausgeführt'`,
   `grund: 'nichts_auszufuehren'`, `httpStatus: null`, `ocsCode: null`; `fetchImpl` 0-mal;
   Summary `nichtAusgefuehrt: 3`, `ok: 0`.
2. `user.update` ohne `displayname`/`email`: dasselbe, 0 Requests.
3. `groupidsByUserid = { a: ['', '  ', 42, null, ' lehrer ', 'lehrer', 'lehrer'] }`: genau **zwei**
   DELETE-Requests, für ` lehrer ` (unverändert, URL-kodiert) und `lehrer`; Item `ok`.
   Zusätzlich `{ a: ['', null] }` mit `groupid: 'x'`: 0 Requests, `nichts_auszufuehren`
   (kein Rückfall auf `groupid`).
4. Im **verbundenen** Zustand: `groups.rename`, `groups.delete`, `groups.members` mit
   `groupid` `42`, `null`, `'  '` -> `messageId: 'gruppenname_leer'`; `groups.create` mit `42` ->
   `gruppe_anlegen_fehlgeschlagen`; jeweils kein `console.error`, kein Request.
5. Teilfehler-Texte: `teilfehlerGruppeZuweisen('x') === 'Gruppe "x" konnte nicht zugewiesen werden'`,
   `teilfehlerGruppeEntfernen('x') === 'Entfernen aus Gruppe "x" fehlgeschlagen'`,
   `teilfehlerSchritt('email') === 'email konnte nicht gesetzt werden'`.
   `grep -rnE 'konnte nicht zugewiesen|fehlgeschlagen\`|konnte nicht gesetzt' src/main` -> 0 Treffer.
   Bestehende ‚teilweise‘-Tests in `tests/pipeline.test.js` bleiben unverändert grün.
6. Rename einer fehlenden Gruppe: gemockte Antwort mit dem belegten Statuscode ->
   `messageId: 'gruppe_existiert_nicht'`.
7. `npm test`, `npm run lint`, `npm run build` grün.

## Nicht im Scope
- Systeminfo (S24), CI/Fenster (S25).
