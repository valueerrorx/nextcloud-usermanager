# S09 — CSV-Import: Parsen und Plan (pur)

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, **`docs/ARCHITECTURE.md` §6 inkl. §6.1 und §6.2 — die 18 Stufen dort sind
die verbindliche Spezifikation**, `docs/RESEARCH-UPN.md`, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md` (40 Einträge).

## Ziel

Aus CSV-Bytes werden Vorschauzeilen mit Status. **Vollständig pur, kein I/O, kein UI, kein
Anlegen von Usern.** Die Vorschautabelle ist S10, das Anlegen S11.

Dies ist nach S02 der zweite Schritt mit hoher Korrektheitsverpflichtung: Hier entsteht, was
später tatsächlich in Nextcloud angelegt wird.

## Dateien
```
src/shared/birthdate.js    parseBirthdate
src/shared/password.js     validatePrefix, buildInitialPassword, beispielPasswort
src/shared/csvImport.js    parseImportCsv (Stufen 1-9), parseUserList
src/shared/importPlan.js   buildImportPlan (Stufen 10-18), truncateToFit-Nutzung
src/shared/messages.js     ERWEITERN um die Fehler-IDs aus ARCHITECTURE §6
tests/birthdate.test.js  tests/password.test.js  tests/csvImport.test.js  tests/importPlan.test.js
tests/fixtures/            je eine CSV pro Datei- und Zeilenfehler
```

## A1. `birthdate.js`
`parseBirthdate(input) -> { ok: true, ddmmyyyy } | { ok: false, messageId }`
- Akzeptiert **`dd.mm.yyyy` und `yyyy-mm-dd`** (DECISIONS), normalisiert **immer** auf `ddmmyyyy`.
- Nicht parsebar -> `datum_format`; kalendarisch ungültig (`31.02.2010`) -> `datum_ungueltig`;
  in der Zukunft -> `datum_zukunft`.
- **Pflichtgrenzwerte:** `29.02.2024` ist gültig (Schaltjahr), `29.02.2023` ist
  `datum_ungueltig`, `31.04.2010` ist `datum_ungueltig`. Heute ist gültig, morgen ist
  `datum_zukunft`. Das „heute" muss **injizierbar** sein (`{ heute }`), sonst ist der Test
  nicht reproduzierbar.

## A2. `password.js`
- `validatePrefix(p)` — Pflicht, 3-20 Zeichen, nur `[A-Za-z0-9]`, **erster Buchstabe groß**
  (DECISIONS „Prefix-Validierung Initialpasswort"). Eigene messageIds je Verstoß.
- `buildInitialPassword(prefix, ddmmyyyy)` -> `` `${prefix}${ddmmyyyy}!` ``.
  Das Sonderzeichen ist **fest `!`**.
- `beispielPasswort(prefix)` -> wie oben mit festem Beispielsdatum `01012010`.
  **Dieselbe Funktion wie die echte Bildung**, nur mit Beispielsdatum — kein zweiter Codepfad.
- Ergebnis lokal auf **>= 10 Zeichen** prüfen.

## A3. `csvImport.js` — Stufen 1-9 (ARCHITECTURE §6)
`parseImportCsv(text) -> { ok, rows: RawRow[], fileError? }`
mit `RawRow = { zeile, vorname, nachname, geburtsdatum, fehler? }`

- **BOM entfernen** (Excel erzeugt einen), CRLF und LF behandeln.
- **Trennzeichen erkennen:** `;` und `,` in der Kopfzeile zählen, das häufigere gewinnen lassen;
  **bei Gleichstand gewinnt `;`** (deutsches Excel, DECISIONS). Beide 0 -> `header_fehlt`.
- Kopfzeile muss `Vorname`, `Nachname`, `Geburtsdatum` enthalten (case-insensitiv, getrimmt),
  sonst `header_fehlt`.
- **Kein RFC4180-Quoting** (DECISIONS „simple CSV"). Eine unbalancierte Quote ist
  `quote_unbalanciert` — **nicht** still verstümmeln.
- Zeilenlimit **2000** -> `zeilenlimit`. Leere Datei -> `datei_leer`. Nur Kopfzeile -> `nur_header`.
- Falsche Spaltenzahl -> `spaltenzahl`. Leerer Vor-/Nachname -> `vorname_leer`/`nachname_leer`.
- **Stufe 9 Doppelzeile:** Vergleich auf dem **Rohtext**, getrimmt, case-insensitiv, Schlüssel
  **`'|'`-getrennt**. Ohne Trenner würden `Ann|Amarie` und `Anna|Marie` verschmelzen.

`parseUserList(text)` — ein Username pro Zeile, optionaler Header `Username`, Leerzeilen weg.

## A4. `importPlan.js` — Stufen 10-18 (ARCHITECTURE §6)
```js
buildImportPlan({ rows, serverUserIds, order, prefix, max = MAX_USERID, heute })
  -> { rows: PreviewRow[], summary: { neu, kollisionAufgeloest, fehler } }
```

**Die verbindliche Reihenfolge und die vier Pflichtfälle stehen in ARCHITECTURE §6 und §6.1.**
Die Punkte, die am leichtesten falsch gemacht werden:

- **Stufe 13: Kollision mit einem bestehenden Nextcloud-User ist ein harter Zeilenfehler**
  `benutzer_existiert_bereits`. Hier wird **nichts** aufgelöst
  (DECISIONS „Kollisionsauflösung: Geltungsbereich"). Nur dadurch ist der Re-Import beweisbar
  sauber. Vergleich **case-insensitiv** gegen `serverUserIds`.
- **Stufe 14: Nur Kollisionen innerhalb der Datei** werden mit `.ddmmyyyy` aufgelöst.
  Registry-Schlüssel ist `finalName.toLowerCase()`, Wert die `identitaet`
  (`normVorname|normNachname|ddmmyyyy`, **`'|'`-getrennt**).
- **Nachtrag nach Verifikation:** Der `'|'`-Trenner ist defensiv, aber **nicht beobachtbar** und
  daher nicht testbar. Der Identitätsvergleich findet nur bei gleichem finalen Username statt,
  was einen identischen Vornamen erzwingt; da das Datum immer 8 Zeichen hat, wären verkettete
  Identitäten genau dann gleich, wenn auch die getrennten gleich sind. Trenner bleibt drin,
  Test entfällt begründet.
- Gleiche Identität erneut -> `benutzer_existiert_bereits`.
  **Verschiedene** Identität, gleicher Name nach Kürzung -> `username_nach_kuerzung_nicht_eindeutig`.
  Diese beiden dürfen **nicht** verwechselt werden.
- **Kürzung läuft vor UND nach dem Suffix**, danach Eindeutigkeit erneut prüfen.
  `truncateToFit` aus `username.js` **wiederverwenden**, nicht neu bauen.
- **Stufe 15: Validierung am finalen String**, nach Kürzung und Suffix. Nicht vorher.
- **Stufe 18: Nur Zeilen, die Stufe 15 bestanden haben, registrieren.** Fehlerzeilen belegen
  keinen Namen für Folgezeilen.
- `displayname = "Vorname Nachname"` in Originalschreibweise; `email` bleibt leer.

`PreviewRow = { zeile, vorname, nachname, ddmmyyyy, username|null, status, gekuerzt, fehlerId?, displayname, passwort|null }`
mit `status ∈ { 'neu', 'kollision_aufgeloest', 'fehler' }`.

## Abnahmekriterien (automatisiert, ~45 Tests — dieser Schritt darf größer sein)

1. `parseBirthdate`: beide Formate; die vier Pflichtgrenzwerte aus A1; injiziertes `heute`.
2. `validatePrefix`: zu kurz, zu lang, Sonderzeichen, kleiner Anfangsbuchstabe, gültig.
   `buildInitialPassword('Schule','01012010') === 'Schule01012010!'`.
   `beispielPasswort` nutzt **denselben** Codepfad (Test: gleiches Ergebnis wie
   `buildInitialPassword(prefix, '01012010')`).
3. `parseImportCsv`: **je eine Fixture-Datei** pro Datei- und Zeilenfehler aus ARCHITECTURE §6,
   jede landet in der erwarteten ID. Plus: BOM, CRLF, Trennzeichen `;`, Trennzeichen `,`,
   **Gleichstand -> `;`**.
4. **Die vier Fälle aus ARCHITECTURE §6.1**, jeweils gegen die konkrete Fehler-ID.
   Fixture `import-kuerzung-gleich-max20.csv` mit `max: 20` und
   `import-kuerzung-gleich-max64.csv` für die Produktionskonstante.
5. **Re-Import:** dieselbe Datei zweimal; im zweiten Lauf enthält `serverUserIds` die im ersten
   Lauf erzeugten Namen -> **jede angelegte Zeile** ergibt `benutzer_existiert_bereits`.
   Zeilen, die schon vorher scheiterten, behalten **ihre eigene** Fehler-ID.
6. **`username_nach_kuerzung_nicht_eindeutig` ≠ `benutzer_existiert_bereits`** — ein Test pro
   Fall, mit unterschiedlichen Identitäten bzw. gleicher Identität.
7. **Stufe-18-Beweis:** eine Fehlerzeile belegt keinen Namen — eine Folgezeile mit demselben
   erzeugten Namen wird `neu`, nicht `kollision_aufgeloest`.
8. **Validierung am finalen String:** ein Eingangsname, der erst **nach** dem Suffix reserviert
   oder zu lang wird, erzeugt die richtige ID.
9. `buildImportPlan` ist pur: kein `fetch`, kein `node:*` (ESLint-Override deckt `src/shared/**`
   bereits ab, plus ein Spy-Test).
10. `summary.neu + summary.kollisionAufgeloest + summary.fehler === rows.length`.

## Ausdrücklich NICHT
- Keine Vorschautabelle, kein Dialog, kein `files.openCsv`, **kein Renderer-Code** (S10).
- Kein Anlegen von Usern, kein `POST`, kein Ergebnis-Export mit Passwörtern (S11).
- Keine Zielgruppen-Auswahl, kein „Gruppe neu anlegen".
- Kein Dashboard, keine Gruppenverwaltung.
- Keine neuen Abhängigkeiten. `username.js` und `quota.js` werden **wiederverwendet**.
