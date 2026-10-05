# Research: Username-Regeln aus dem Referenzprojekt

Stand 2026-10-05. Quelle: `/home/valueerror/Nextcloud/WebDEV/Microsoft365-Manager` (read-only).
Das hier ist die **autoritative Spezifikation** für den Username-Generator. Coder und Tester
brauchen das Referenzprojekt nicht zu lesen.

## 1. Normalisierung einer Namenskomponente

Autoritative Quelle: `src/utils/upn.js:14-26`. Eine byte-identische Kopie liegt in `index.js:948-960`
(kein Abweichung). Die Schritte laufen **in dieser Reihenfolge**:

1. Falsy-Input (`''`, `null`, `undefined`, `0`) -> `''`, sofortiger Rücksprung.
2. `String(text)`-Coercion.
3. Deutsche Umlaute und Eszett: `ä/Ä -> ae`, `ö/Ö -> oe`, `ü/Ü -> ue`, `ß -> ss`.
4. Akzentuierte Vokale, jeweils Groß- und Kleinform:
   - `à á â ã ă À Á Â Ã Ă -> a`
   - `è é ê ë È É Ê Ë -> e`
   - `ì í î ï Ì Í Î Ï -> i`
   - `ò ó ô õ Ò Ó Ô Õ -> o`
   - `ù ú û Ù Ú Û -> u`
   - `ý ÿ ȳ Ý Ÿ Ȳ -> y`
5. Konsonanten: `ç ć č Ç Ć Č -> c`, `ñ Ñ -> n`, `ž Ž -> z`, `š Š -> s`, `đ Đ -> d`.
6. Generischer Fallback: `normalize('NFD')`, dann Entfernen aller Zeichen im Bereich
   **U+0300 bis U+036F** (Combining Diacritical Marks). Fängt alles ab, was die Tabellen
   oben nicht abdecken.
7. `toLowerCase()`.
8. Whitelist-Strip: alles außer `a-z`, `0-9` und dem Punkt `.` wird **gelöscht, nicht ersetzt**.

Die exakten Regexe stehen in der Reihenfolge 3-8 in `src/utils/upn.js:14-26` und sind 1:1 zu portieren.

### Folgen für einzelne Zeichen
- **Leerzeichen** werden gelöscht, nicht in einen Trenner umgewandelt.
- **Bindestriche** werden gelöscht. `Müller-Lüdenscheidt` -> `muellerluedenscheidt`.
- **Apostrophe** werden gelöscht. `O'Brien` -> `obrien`.
- **Punkte bleiben erhalten** (explizit in der Whitelist). Achtung: ein Punkt im Rohnamen ist
  danach nicht mehr vom Trennpunkt zu unterscheiden.
- **Ziffern** bleiben erhalten.
- **Nicht-lateinische Schriften** (CJK, Kyrillisch, Arabisch) werden nicht transliteriert und
  fallen in Schritt 8 komplett weg -> Ergebnis `''`.

## 2. Doppelnamen
Es gibt **keine** Aufspaltung, kein Sonderhandling und keinen eingefügten Trenner.
Mehrteilige Namen kollabieren zu einem Token:
- `Anna Maria` -> `annamaria`
- `Müller-Lüdenscheidt` -> `muellerluedenscheidt`

**Falle:** In `RemoveUsersView.vue:499-501` und `RemoveDevicesView.vue:393-397` existiert eine
Aufspaltung an `/[-\s]/`. Die gehört zum Fuzzy-Matching beim **Löschen** bestehender Accounts und
ist **nicht** Teil der Username-Erzeugung. Nicht portieren.

## 3. Zusammensetzung
Quelle: `src/utils/upn.js:4-10, 29-41`.
- Trenner ist ein Punkt `.`.
- Reihenfolge-Konstanten: `givenFirst` (Default) -> `vorname.nachname`, `surnameFirst` -> `nachname.vorname`.
- `normalizeUpnOrder()` fällt bei jedem unbekannten Wert auf `givenFirst` zurück.
- Ist **eine** der beiden normalisierten Komponenten leer, ist das Ergebnis `''` —
  kein Teil-Username, kein Fallback. Das ist ein Fehlerfall für die Importvorschau.

## 4. Domain
`buildUpn()` hängt `@${domain}` an. **Für Nextcloud entfällt das vollständig** — das Ergebnis von
`buildUpnLocal()` ist der komplette Username. Nach der Konkatenation passiert keine weitere
Transformation.

## 5. Kollisionsauflösung — existiert im Referenzprojekt NICHT
Nachgewiesen in `scripts/update-user-passwords.ps1:172-180, 287-292`: existiert der UPN schon,
wird die CSV-Zeile **abgelehnt** und als Fehler `"Benutzer existiert bereits"` gemeldet.
Kein Zählersuffix, kein Padding, kein zweiter Versuch.

**Konsequenz:** Die in `docs/DECISIONS.md` festgelegte Regel (volles Geburtsdatum anhängen) ist
ein **Neuentwurf**, nichts zu portieren. Nachweis nötig per eigener Unit-Tests.

## 6. Längenlimits
Keine. Weder Truncation noch Längenvalidierung im Referenzprojekt.
`src/utils/passwordValidator.js:9-23` prüft nur Passwortkomplexität, nicht Usernames.
Nextcloud-seitiges Limit siehe `docs/RESEARCH-OCS.md` Abschnitt 7.

## 7. Geburtsdatum — kein Präzedenzfall
Projektweite Suche nach `geburtsdatum`, `birthdate`, `birthday`, `dob`: **null Treffer**.
Der CSV-Parser (`index.js:1006-1052`) kennt keine Geburtsdatumsspalte.
Die Verwendung ist damit vollständig Neuentwurf laut `docs/DECISIONS.md`.

## 8. Initialpasswort — kein Präzedenzfall
Keine Passwortgenerierung im Referenzprojekt. Passwörter sind immer vom Nutzer geliefert
(Formularfeld oder CSV-Spalte). Zeilen ohne Passwort werden übersprungen
(`scripts/update-user-passwords.ps1:150-153`).
Nur Validierung existiert: mindestens 8 Zeichen, mindestens 3 der 4 Klassen
{Großbuchstabe, Kleinbuchstabe, Ziffer, Sonderzeichen}.

## 9. Anzeigename im Referenzprojekt
Dort durchgehend **`Nachname Vorname`** in Originalschreibweise
(`scripts/update-user-passwords.ps1:163`, `src/views/CreateUsersView.vue:349`),
bewusst **nicht** an den Reihenfolge-Schalter gekoppelt.

**Abweichung:** Für dieses Projekt wurde `Vorname Nachname` entschieden
(`docs/DECISIONS.md`). Das ist eine gewollte Abweichung; `GOAL.md` fordert den 1:1-Port
nur für die **Username**-Regeln.

## 10. Autoritative Fixtures aus dem Referenzprojekt
`scripts/check-upn-order.mjs:15-19` ist das einzige Test-Artefakt dort. Direkt übernehmbar
(ohne `@domain`):

    normalizeUpnOrder('nope')                        === 'givenFirst'
    buildUpnLocal('max','mustermann','givenFirst')   === 'max.mustermann'
    buildUpnLocal('max','mustermann','surnameFirst') === 'mustermann.max'
    buildUpn('Max','Müller','schule.at','givenFirst')   === 'max.mueller@schule.at'
    buildUpn('Max','Müller','schule.at','surnameFirst') === 'mueller.max@schule.at'

## 11. Testtabelle (im Referenzcode nachgerechnet und mit Node verifiziert)

| Vorname | Nachname | norm(V) | norm(N) | givenFirst | surnameFirst |
|---|---|---|---|---|---|
| `Max` | `Mustermann` | `max` | `mustermann` | `max.mustermann` | `mustermann.max` |
| `Müller` | `Lüdenscheidt` | `mueller` | `luedenscheidt` | `mueller.luedenscheidt` | `luedenscheidt.mueller` |
| `Anna Maria` | `Musterfrau` | `annamaria` | `musterfrau` | `annamaria.musterfrau` | `musterfrau.annamaria` |
| `Björn` | `Müller-Lüdenscheidt` | `bjoern` | `muellerluedenscheidt` | `bjoern.muellerluedenscheidt` | `muellerluedenscheidt.bjoern` |
| `Weiß` | `Straße` | `weiss` | `strasse` | `weiss.strasse` | `strasse.weiss` |
| `O'Brien` | `Smith` | `obrien` | `smith` | `obrien.smith` | `smith.obrien` |
| `Jean-Luc` | `Picard` | `jeanluc` | `picard` | `jeanluc.picard` | `picard.jeanluc` |
| `Ștefan` | `Țăranu` | `stefan` | `taranu` | `stefan.taranu` | `taranu.stefan` |
| `René` | `García` | `rene` | `garcia` | `rene.garcia` | `garcia.rene` |
| `ÄÖÜ` | `SS` | `aeoeue` | `ss` | `aeoeue.ss` | `ss.aeoeue` |
| `anna` | `MUSTERMANN` | `anna` | `mustermann` | `anna.mustermann` | `mustermann.anna` |
| `Mary Ann` | `OConnor-Smith` | `maryann` | `oconnorsmith` | `maryann.oconnorsmith` | `oconnorsmith.maryann` |
| `李` | `四` | `` | `` | `''` (Fehlerfall) | `''` (Fehlerfall) |
| `` | `Nachname` | `` | `nachname` | `''` (Fehlerfall) | `''` (Fehlerfall) |

Alle Zeilen außer CSJK/leer wurden mit der echten Regex-Kette in Node ausgeführt.
Die beiden Fehlerfall-Zeilen folgen aus den Guards `if (!text) return ''` und `if (!vn || !nn) return ''`.

## 12. Beobachtete Inkonsistenzen im Referenzprojekt (nicht mitportieren)
1. `scripts/update-user-passwords.ps1:81-108` enthält eine **dritte** Implementierung
   (`Normalize-ForUPN`, PowerShell), die produktiv läuft. Ihr fehlen die Gruppen
   `ă/Ă`, `ć č Ć Č`, `ȳ Ȳ`, `ž Ž`, `š Š`, `đ Đ` sowie der NFD-Fallback.
   Praktisch identisches Ergebnis für die getesteten Fälle, weil der Whitelist-Strip am Ende
   dasselbe wegräumt. **Autoritativ ist die JS-Version in `src/utils/upn.js`.**
2. `buildUpn()` lowercased die Domain nicht, `resolveUpnForEntry()` (`src/utils/upn.js:49`) schon.
   Nach dem Wegfall der Domain irrelevant.
