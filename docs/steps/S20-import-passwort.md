# S20 Import: Passwort-Spalte 1:1 + Zählerkollision

## Anlass
Nutzer importierte eine CSV mit Passwort `1234`; der Login scheiterte. Ursache: Die 3. Spalte
heißt seit `d8064d3` `Passwort`, wird intern aber weiter als `geburtsdatum` geführt und zu
`<Prefix><Wert>!` umgebaut (datumsähnliche Werte zusätzlich zu `ddmmyyyy`). Außerdem landet der
Wert bei Namensgleichheit in der Datei als Suffix im Username (Passwort-Leak, Review kritisch).

## Entscheidungen (docs/DECISIONS.md, alle 2026-10-14)
- Spalte `Passwort` wird **1:1** als Initialpasswort benutzt: nur äußeres Trimmen wie bei allen
  Zellen, kein Prefix, kein `!`, keine Datumsinterpretation.
- Leere (oder nur aus Leerzeichen bestehende) Passwort-Zelle -> Zeilenfehler `passwort_leer`
  („Passwort fehlt.“).
- Keine lokale Längen-/Policy-Prüfung; der Server entscheidet (107).
- Doppelzeile = gleicher Name (roh, getrimmt, case-insensitiv) **und** identisches Passwort
  (case-sensitiv) -> `doppelzeile`. Passwort nur im Speicher verglichen, nie ausgegeben.
- Gleicher Name, anderes Passwort, oder Schreibvariante (Müller/Mueller) in derselben Datei:
  Zählersuffix `.2`, `.3`, … an der gewählten Reihenfolge.
- Kollision mit bestehendem Nextcloud-User (Basis- **oder** Suffix-Kandidat) bleibt Zeilenfehler
  `benutzer_existiert_bereits` — kein Weiterzählen am Server vorbei (Re-Import bleibt sauber).
- Das Passwort fließt nie in Username, Suffix oder Registry.

## Umsetzung

### `src/shared/csvImport.js`
- RawRow-Feld `geburtsdatum` -> `passwort`; Header-Kommentar anpassen.
- Leere Zelle (nach Trim) -> `fehler: 'passwort_leer'`, geprüft nach `vorname_leer`/`nachname_leer`.
- Doppelzeilen-Schlüssel: `JSON.stringify([vorname.toLowerCase(), nachname.toLowerCase(), passwort])`
  (Passwort **nicht** lowercased; kein `|`-Join, weil das Passwort Freitext ist). Nur für den
  Vergleich, nie ausgegeben.
- Prüfreihenfolge je Zeile: quote, spaltenzahl, vorname_leer, nachname_leer, passwort_leer,
  doppelzeile.
- Kommentar Z. 53-55 (Verweis auf „Stufe 14b“) an die neue Logik anpassen.
- CSV-Grenzen bleiben (kein Quoting): Passwort mit Trennzeichen -> `spaltenzahl`, ungerade Anzahl
  `"` -> `quote_unbalanciert`, gerade Anzahl `"` wird wörtlich übernommen.

### `src/shared/importPlan.js`
- Entfernen: `parseBirthdate`-Import, `geburtsdatumAnteil`, `kollisionsSuffix`, Feld `ddmmyyyy`
  in `fehlerZeile`/`erfolgsZeile`, Parameter `prefix` und `heute` von `buildImportPlan`, der
  Identitätsschlüssel. Registry wird ein `Set` belegter Namen (lowercase).
- Erfolgszeile: `passwort: row.passwort`. Fehlerzeile: `passwort: null`.
- Ablauf pro Zeile (ohne Zeilenfehler aus dem Parser):
  1. Normalisieren; nicht abbildbar -> `name_nicht_abbildbar` (wie bisher).
  2. Basis-Kandidat mit `truncateToFit(suffix: '')`; passt nicht -> `username_zu_lang`.
     Auf Server -> `benutzer_existiert_bereits` (username = Basis). Frei in Datei -> Stufe 15,
     Status `neu`.
  3. Sonst für n = 2, 3, …: Suffix `.n`, `truncateToFit` **je n neu** (n=10 ist ein Zeichen länger);
     passt nicht -> `username_zu_lang` (username = Basis-Kandidat). Auf Server ->
     `benutzer_existiert_bereits` (username = dieser `.n`-Kandidat), **kein** Weiterzählen.
     In Datei belegt -> n+1. Frei -> Stufe 15, Status `kollision_aufgeloest`,
     `gekuerzt` gemäß Kürzung für dieses n.
  4. Stufe 15 `validateUserid(…, { quelle: 'generator' })` auf dem finalen Kandidaten; Fehler ->
     Zeilenfehler, **kein** Weiterzählen.
  5. Nur Zeilen, die Stufe 15 bestanden haben, kommen in die Registry.
- Keine Obergrenze für n (endet spätestens bei MAX_ROWS+1, weil die Registry endlich ist).
- `username_nach_kuerzung_nicht_eindeutig` ist unerreichbar: ID, Text in `messages.js` und
  zugehörige Tests (tests/importPlan.test.js ca. Z. 33, 63, 146-165) entfernen.

### Entfernen
- `src/shared/password.js`, `tests/password.test.js`.
- `src/shared/birthdate.js`, `tests/birthdate.test.js` (nach grep ohne weitere Aufrufer).
- `messages.js`: `datum_*`-Einträge; neu `passwort_leer: 'Passwort fehlt.'`.
- Fixtures `import-datum-formate.csv`, `import-datum-ungueltig.csv`, `import-datum-zukunft.csv`.

### Renderer
- `src/renderer/state.js`: `importPrefix` samt Reset entfernen.
- `src/renderer/views/ImportView.vue`: Prefix-Feld, Live-Beispiel, `beispielPasswort`-Import und
  `prefix:`-Argument entfernen. Zeile 466 `zeile.ddmmyyyy ?? '—'` -> `zeile.passwort ?? '—'`
  (Spalte „Passwort“ zeigt das exakt gesetzte Passwort). Hinweistext bei den Spalten:
  „Passwort wird übernommen wie in der Datei (ohne Leerzeichen am Anfang/Ende); die
  Passwortrichtlinie des Servers gilt.“ Kommentare Z. 2-4 und 65-70 neu: `importRows` und
  `importPlanRows` enthalten jetzt Klartext-Passwörter und werden beim Verlassen geleert.
- `src/shared/importView.js`: Export-Spalte `passwort` unverändert (enthält den CSV-Wert).

### Tests (umschreiben, nicht nur anpassen)
- `tests/importPlan.test.js` (RawRows mit `geburtsdatum`, `'Schule1.1.2000!'`, `ddmmyyyy`,
  Stufe-14b-Fälle), `tests/csvImport.test.js`, `tests/state.test.js` (`importPrefix`).
- Neue Fixtures: `import-passwort-leer.csv`, `import-kollision-zaehler.csv`;
  `import-doppelzeile.csv` an die neue Regel angleichen (gleicher Name + gleiches Passwort).
- `import-kuerzung-gleich-max20.csv` (Ann Bergmannschneider/…huber/…meier, gleiches Passwort):
  keine Doppelzeile mehr, Erwartung `ann.bergmannschneide`, `ann.bergmannschnei.2`,
  `ann.bergmannschnei.3`. `-max64.csv` analog mit max=64 neu festschreiben (von Hand hergeleitet).
- `tests/state.test.js`: `resetOnConnect`-Assertions behalten, nur `importPrefix` entfernen.

### Docs (Coder darf)
- `docs/ARCHITECTURE.md` §4.1/§6: Stufe 8 Geburtsdatum, Stufen 12-14, `validatePrefix`,
  `checkMinLength` auf den neuen Stand.
- `docs/MANUAL-TEST.md`: alle Prefix-/Geburtsdatum-Bezüge umschreiben; Nummern behalten,
  neue Fälle mit Buchstabensuffix.

## Akzeptanz
1. `Max;Mueller;1234` -> Plan-Zeile `passwort === '1234'`; die Import-Action (`byUserid`) trägt
   `password: '1234'`.
2. Passwörter `01.01.2000`, `2000-01-01`, `Ab!c d`, `äöü€`, `a""b` bleiben byte-identisch
   (nach äußerem Trim).
3. Leere Zelle und `'   '` -> `fehler`/`passwort_leer` mit deutschem Text. Passwort mit
   Trennzeichen -> `spaltenzahl`; mit einem `"` -> `quote_unbalanciert`.
4. `Max;Mueller;A`, `Max;Müller;B`, `max;mueller;C` -> `max.mueller`, `max.mueller.2`,
   `max.mueller.3`, Status `neu`, `kollision_aufgeloest`, `kollision_aufgeloest`. Reihenfolge
   nachname.vorname -> `mueller.max`, `mueller.max.2`, `mueller.max.3`.
5. `Max;Mueller;A` zweimal -> zweite Zeile `doppelzeile`. `Max;Mueller;A` und `MAX;mueller;a`
   -> zweite Zeile `max.mueller.2` (Passwort case-sensitiv).
6. Server kennt `max.mueller` -> alle drei Max-Mueller-Zeilen `benutzer_existiert_bereits`.
   Server kennt nur `max.mueller.2` -> Zeile 1 `neu`, Zeilen 2 **und** 3
   `benutzer_existiert_bereits` (kein Sprung auf `.3`), username jeweils `max.mueller.2`.
7. Re-Import derselben Datei ergibt für jede zuvor angelegte Zeile `benutzer_existiert_bereits`.
8. Nachname `Mueller.2`: Reihenfolge [Max Mueller.2, Max Mueller, Max Mueller] mit drei verschiedenen Passwörtern ->
   `max.mueller.2`, `max.mueller`, `max.mueller.3`.
9. Kürzung (max=20, vorname.nachname): `Ann;Bergmannschneider;x` / `…;y` ->
   `ann.bergmannschneide` (neu, gekuerzt) und `ann.bergmannschnei.2` (kollision_aufgeloest,
   gekuerzt). 10 Zeilen gleichen Namens: n=9 -> `ann.bergmannschnei.9`, n=10 ->
   `ann.bergmannschne.10`. Alle genau 20 Zeichen. Fixture max20 wie oben.
10. Stufe 15: `nextcloud;log;x` -> `username_reserviert`, username `nextcloud.log`; zweite Zeile
    `nextcloud;log;y` -> ebenfalls `username_reserviert` mit `nextcloud.log` (nicht `.2`; beweist,
    dass nichts registriert wurde).
11. Unabhängigkeit: dieselben Zeilen mit einer festen Permutation fester, paarweise verschiedener
    Passwörter liefern identische `username`- und `status`-Werte.
12. `Max;Mueller;a|b` und `Max;Mueller|a;b` sind keine Doppelzeile. Zwei gleichnamige Zeilen mit
    leerem Passwort -> beide `passwort_leer`. `resetOnConnect` leert weiterhin die Importdaten;
    MANUAL-TEST bekommt einen Fall „Import laden, Ansicht wechseln, zurück -> Vorschau leer“.
13. `grep -rnE "geburtsdatum|Geburtsdat|ddmmyyyy|buildInitialPassword|beispielPasswort|parseBirthdate|importPrefix|prefix:" src`
    leer.
14. UI: kein Prefix-Feld; Vorschau zeigt exakte Passwörter. `npm test`, `npm run lint`,
    `npm run build` grün.

## Nicht im Scope
- Servertext bei 107 im Bericht (S21), Systeminfo, CI, sonstige Review-Befunde (S21-S24).
- Zufallspasswörter, Policy-Prüfung im Client.
