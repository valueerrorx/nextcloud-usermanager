# S02 — Username-Generator (pur)

Status: approved (nach einer Revisionsrunde)
Bindend: `CLAUDE.md`, `docs/RESEARCH-UPN.md` (autoritativ für die Regeln),
`docs/ARCHITECTURE.md` §2, §6 Stufen 10-12, §6.2, §11, `docs/REVIEW-NOTES.md`.

## Ziel

Das pure Modul `src/shared/username.js` plus `src/shared/messages.js`.
Dies ist die **größte Korrektheitsverpflichtung des Projekts**: GOAL.md verlangt den
1:1-Port der Username-Regeln aus dem Referenzprojekt, mit Tests belegt.
Kein Netzwerk, kein Dateisystem, keine UI.

## Dateien

```
src/shared/username.js    normalizeComponent, buildUsername, normalizeOrder,
                          truncateToFit, validateUserid, MAX_USERID, RESERVED_USERIDS
src/shared/messages.js    messageId -> deutscher Text; in S02 NUR die IDs, die
                          username.js erzeugen kann. Append-only, wächst in Folgeschritten.
eslint.config.js          ERWEITERN: no-restricted-imports/-globals für src/shared/**
tests/username.test.js
tests/messages.test.js
tests/skeleton.test.js    ÄNDERN: den Block „src/shared/ existiert in S01 nicht" LÖSCHEN
```

**Quelle für die Regexe:** `docs/RESEARCH-UPN.md` §1 listet die Zeichengruppen, nicht den
Regex-Quelltext. Du darfst `/home/valueerror/Nextcloud/WebDEV/Microsoft365-Manager/src/utils/upn.js`
Zeilen 14-26 **lesen** (read-only, per Projektkonfiguration erlaubt), um buchstäblich zu portieren.
Ändere dort nichts.

## Exportierte API — verbindlich

```js
export const MAX_USERID = 64;             // RESEARCH-OCS §7, defensiv
export const ORDER_GIVEN_FIRST   = 'givenFirst';
export const ORDER_SURNAME_FIRST = 'surnameFirst';
export const RESERVED_USERIDS = Object.freeze([...]);   // lowercase

normalizeOrder(order)                   -> 'givenFirst' | 'surnameFirst'
normalizeComponent(text)                -> string
buildUsername(vorname, nachname, order) -> string
truncateToFit({ first, second, suffix, max }) -> { second, gekuerzt, passt }
validateUserid(s, { quelle })           -> { ok, messageId? }
```

## 1. `normalizeComponent`

Schritte **in dieser Reihenfolge**, 1:1 aus RESEARCH-UPN §1:

1. Falsy-Input -> `''`, sofortiger Rücksprung.
2. `String(text)`-Coercion.
3. `ä/Ä->ae`, `ö/Ö->oe`, `ü/Ü->ue`, `ß->ss`.
4. `àáâãăÀÁÂÃĂ->a`, `èéêëÈÉÊË->e`, `ìíîïÌÍÎÏ->i`, `òóôõÒÓÔÕ->o`, `ùúûÙÚÛ->u`, `ýÿȳÝŸȲ->y`.
5. `çćčÇĆČ->c`, `ñÑ->n`, `žŽ->z`, `šŠ->s`, `đĐ->d`.
6. `normalize('NFD')`, dann Entfernen aller Zeichen **U+0300 bis U+036F**.
7. `toLowerCase()`.
8. Whitelist-Strip: alles außer `a-z`, `0-9`, `.` wird **gelöscht, nicht ersetzt**.

**Reihenfolge ist nicht verhandelbar.** Liefe Schritt 6 vor Schritt 3, zerlegte NFD das `ü`
in `u` + Combining Diaeresis, der Strich fiele weg, `/[üÜ]/` träfe nicht mehr — Ergebnis
`muller` statt `mueller`. Genau das muss ein Test absichern.

**`normalizeComponent` ist idempotent** — `normalizeComponent(normalizeComponent(x))
=== normalizeComponent(x)`. Das ist **tragend**, weil `importPlan` in S09 die Funktion auf
bereits normalisierte Komponenten erneut anwendet. Mit Test belegen.

**Keine Längenbegrenzung** in dieser Funktion. Eine 500-Zeichen-Eingabe kommt in voller Länge
zurück; gekürzt wird erst in `truncateToFit`.

### Festgelegte Randfälle (alle als Test)
| Eingabe | Ergebnis | Begründung |
|---|---|---|
| `0` (Zahl) | `''` | Falsy-Guard aus Schritt 1 |
| `'0'` | `'0'` | Ziffern bleiben |
| `'Müller'` (vorkomponiert, NFC, U+00FC) | `'mueller'` | Schritt 3 greift |
| `123` (Zahl) | `'123'` | Coercion, nicht falsy |
| `null`, `undefined`, `false`, `''` | `''` | Falsy-Guard |
| `'Mu' + '\u0308' + 'ller'` (dekomponiert, NFD) | `'muller'` | Schritt 3 trifft nur das **vorkomponierte** `ü` (U+00FC). Hier steht `u` + Combining Diaeresis, also greift erst Schritt 6 und entfernt den Strich. **1:1-treu, kein Bug** — macOS exportiert CSVs in NFD. Im Test als Escape schreiben, nie als Literal |
| `'St. Clair'` | `'st.clair'` | Punkt überlebt, Leerzeichen fällt weg |
| `'Max.'` + `'Müller'` | `'max..mueller'` | Doppelpunkt entsteht legitim; das Referenzprojekt verhält sich identisch |
| `'李'` | `''` | Nicht-lateinisch fällt in Schritt 8 weg |

## 2. `buildUsername`

**`buildUsername` normalisiert seine beiden Argumente intern** (entspricht `buildUpn` des
Referenzprojekts, nicht `buildUpnLocal`). Das ist gefahrlos, weil `normalizeComponent`
idempotent ist — S09 übergibt bereits normalisierte Komponenten und erhält dasselbe Ergebnis.

- Trenner ist ein Punkt.
- `givenFirst` (Default) -> `vorname.nachname`, `surnameFirst` -> `nachname.vorname`.
- `normalizeOrder` fällt bei **jedem** unbekannten Wert auf `givenFirst` zurück
  (`undefined`, `null`, `'nope'` -> `givenFirst`).
- Ist eine **normalisierte** Komponente leer -> Rückgabe `''`. Kein Teil-Username.
- **Keine Domain.** Das `@domain` des Referenzprojekts entfällt vollständig.

## 3. `truncateToFit`

```
Budget für second = max - first.length - 1 (Trennpunkt) - suffix.length
```
- `max` hat den Default `MAX_USERID`.
- Budget `>= second.length` -> `{ second, gekuerzt: false, passt: true }`.
- Budget `>= 1` -> `second` von rechts auf das Budget geschnitten,
  `{ second: gekuerzt, gekuerzt: true, passt: true }`. Nachname behält **mindestens 1 Zeichen**.
- Budget `< 1` -> `{ second, gekuerzt: false, passt: false }` -> Aufrufer erzeugt
  `username_zu_lang`.

**Alle drei Schlüssel sind auf jedem Pfad gesetzt**, auch bei `passt: false`.

**Fehlende Argumente scheitern kontrolliert, nicht per TypeError.** Das Argumentobjekt selbst
hat den Default `{}`, `first`/`second`/`suffix` jeweils `''`, `max` den Wert `MAX_USERID`.
`truncateToFit()` und `truncateToFit(null)` werfen also nicht. Jeder dieser Defaults braucht
einen eigenen Test — bei der ersten Fassung waren zwei von drei ungeprüft.

**Nicht-String-Werte für `first`/`second`/`suffix` sind außerhalb des Kontrakts.** Aufrufer
übergeben normalisierte Strings; eine Zahl darf werfen. Hier wird bewusst **nicht** gecoerct,
damit ein Aufrufer-Fehler sichtbar bleibt statt stillschweigend ein falsches Ergebnis zu liefern.
Leeres `first` oder `second` ist kein Sonderfall: die Arithmetik gilt unverändert; ein leeres
`second` hat Länge 0, passt also immer.

`first` ist **fest der Vorname**, `second` **fest der Nachname** — nicht „links/rechts",
unabhängig von `order`. `first` wird nie gekürzt und daher nicht zurückgegeben.
Die Funktion ist **reihenfolgeunabhängig**, weil nur Längen zählen; der Trenner ist in beiden
Reihenfolgen genau ein Punkt und das Suffix trägt seinen eigenen führenden Punkt.

**Invariante, als Test — gilt nur auf dem `passt: true`-Pfad:**
`first.length + 1 + second.length + suffix.length <= max`.

`gekuerzt: true` **implizit** `total === max`. Die Umkehrung gilt **nicht**: am Grenzwert
`budget === second.length` ist `total === max` **und** `gekuerzt === false`, weil der Nachname
exakt passt und nicht geschnitten wird. Eine frühere Fassung dieser Spec behauptete „`=== max`
genau dann, wenn `gekuerzt: true`" — das war falsch und blieb unentdeckt, weil der Grenzwert in
keinem Test eingesetzt wurde. Auf dem Nicht-Kürzungs-Pfad gilt also `total <= max`, nicht `<`.

Bei `passt: false` kommt `second` unverändert zurück, die Summe darf dort legitim über `max`
liegen; dieser Fall wird separat geprüft.

**Pflichtgrenzwerte als Test:** `budget === second.length` (mit und ohne Suffix) ->
`gekuerzt: false`, `second` unverändert. Ohne diesen Fall überlebt die Mutation
`budget >= second.length` -> `budget > second.length` die gesamte Suite und setzt `gekuerzt: true`
auf einem nie gekürzten Namen — das Flag landet in der Importvorschau.

`suffix` ist `''` oder `'.ddmmyyyy'` (9 Zeichen). S02 **erzeugt kein Suffix**, es kommt als Argument.

## 4. `validateUserid(s, { quelle })`

**Prüfreihenfolge verbindlich** — sie entscheidet, welche ID bei mehreren Verstößen feuert:

1. leer / kein String -> `username_leer`
2. nur Punkte -> `username_nur_punkte`
3. Länge `> MAX_USERID` -> `username_zu_lang`
4. reservierter Name -> `username_reserviert`
5. Zeichensatzverstoß -> `username_zeichen`

- **Trimmt nicht, lowercased nicht, gibt niemals einen transformierten Wert zurück.**
  Nur `{ ok }` bzw. `{ ok: false, messageId }`.
- Nicht-String-Eingabe (`null`, `42`, `{}`) -> `username_leer`.
- Fehlendes oder unbekanntes `quelle` -> **strengster** Zeichensatz (`generator`). Fail closed.
- Das zweite Argument wird **nicht destrukturiert**: `validateUserid('Max', null)` oder mit einem
  String/Number als zweitem Argument wirft nicht, sondern fällt ebenfalls auf `generator` zurück.
  Ein Validator mit „fail closed"-Kontrakt darf nicht werfen.

Zeichensatz (DECISIONS „Zeichensatz für manuell eingegebene `userid`"):
- `quelle: 'generator'` -> `[a-z0-9.]`. Regressionssperre.
- `quelle: 'manuell'` -> `[A-Za-z0-9_.@-]`. Keine Leerzeichen, kein Apostroph, obwohl Nextcloud
  beide zulässt — sie provozieren Quoting-Fehler in URLs, CSV und Shell.

`RESERVED_USERIDS` (frozen, lowercase), aus RESEARCH-OCS §7:
`.htaccess`, `files_external`, `__groupfolders`, `.ncdata`, `owncloud.log`, `nextcloud.log`,
`updater.log`, `audit.log`.
Zusätzlich **jeder Name mit Präfix `appdata_`** — die echte Instanz-ID ist unbekannt.
**Beide Prüfungen case-insensitiv**: Vergleich über `s.toLowerCase()`, also sind `.HTACCESS`
und `APPDATA_x` ebenfalls reserviert.

## 5. `messages.js`

`messageId -> deutscher Text`, die **einzige** Quelle für UI-Texte. In S02 genau diese fünf:
`username_leer`, `username_nur_punkte`, `username_zu_lang`, `username_zeichen`,
`username_reserviert`. Texte wie in ARCHITECTURE §6.2 vorgegeben.
Keine Platzhalter für spätere Schritte. **Append-only** — drei der fünf nutzt S09 unverändert.

## Abnahmekriterien (alle automatisiert)

1. **Alle 14 Zeilen aus RESEARCH-UPN §11**, und zwar **alle vier Spalten**: `norm(Vorname)`,
   `norm(Nachname)`, Ergebnis `givenFirst`, Ergebnis `surnameFirst`. Inklusive der zwei
   `''`-Fehlerfälle (CJK, leerer Vorname).
2. **Alle 5 Fixtures aus RESEARCH-UPN §10**, ohne `@domain`.
3. **Reihenfolge-Beweis**: `Müller` -> `mueller`, nicht `muller`. Zusätzlich `Weiß` -> `weiss`.
4. **Idempotenz** über alle 14 Tabelleneingaben.
5. Alle Randfälle aus der Tabelle in Abschnitt 1.
6. `truncateToFit`: Budget `>= second.length`, `>= 1`, `< 1`; mit und ohne Suffix; alle drei
   Schlüssel auf jedem Pfad; Reihenfolgeunabhängigkeit; die Invariante aus Abschnitt 3.
7. `validateUserid` — **mit erwarteter messageId je Fall**, nicht nur `ok: false`:
   | Eingabe | `quelle` | erwartet |
   |---|---|---|
   | `''` | beide | `username_leer` |
   | `null`, `42` | beide | `username_leer` |
   | `'...'` | beide | `username_nur_punkte` |
   | 64 Zeichen `a` | beide | `ok: true` |
   | 65 Zeichen `a` | beide | `username_zu_lang` |
   | `'.htaccess'`, `'.HTACCESS'` | beide | `username_reserviert` |
   | `'appdata_abc'`, `'APPDATA_x'` | beide | `username_reserviert` |
   | `'müller!'` | beide | `username_zeichen` |
   | `'max_mueller'` | `manuell` | `ok: true` |
   | `'max_mueller'` | `generator` | `username_zeichen` |
   | `'Max'` | `manuell` | `ok: true` |
   | `'Max'` | `generator` | `username_zeichen` |
   | `'max.mueller'` | fehlend | `ok: true` |
   | `'Max'` | fehlend | `username_zeichen` (fail closed) |
8. **Keine I/O** — zweistufig, **kein** Quelltext-Regex:
   a) `eslint.config.js` erhält einen Override für `files: ['src/shared/**/*.js']` mit
      `no-restricted-imports` (`node:*`, `electron`, `vue`, `fs`, `path`, `child_process`) und
      `no-restricted-globals` (`fetch`, `process`, `require`, `XMLHttpRequest`).
      **Nachweis beilegen**, dass die Regel wirklich greift: `npx eslint --print-config
      src/shared/username.js` zeigt sie. (REVIEW-NOTES [S01]: grünes Lint ist kein Beweis für
      Abdeckung.)
   b) Ein Test stubbt `globalThis.fetch` mit einem werfenden Spy, ruft **jeden** Export auf und
      behauptet, der Spy wurde nie aufgerufen.
9. `messages.test.js`: **Vorwärtsrichtung** — `validateUserid` wird in alle fünf Fehlerzustände
   getrieben, und jede zurückgegebene ID löst zu einem nicht-leeren deutschen Text auf.
   **Keine** Prüfung auf unbenutzte IDs: das wäre eine exakte Allowlist und würde in S03
   planmäßig rot (REVIEW-NOTES [S01]).
10. `tests/skeleton.test.js`: der Block, der `src/shared/` als nicht existent behauptet, ist
    **entfernt**. Ohne das wird die Suite mit dem ersten S02-Commit rot.
11. `npm test` und `npm run lint` grün.

## Ausdrücklich NICHT in diesem Schritt

- Kein `birthdate.js`, `csvImport.js`, `importPlan.js`, `quota.js`, `pool.js`, `dryRun.js`,
  `resultCsv.js`, `userView.js`, `filters.js`, `dashboard.js`, `url.js`.
- Keine Kollisionsauflösung, kein Identitäts-Register, keine Vorschauzeilen, keine Import-
  Fehler-IDs (`benutzer_existiert_bereits`, `username_nach_kuerzung_nicht_eindeutig`, …).
- Keine Datums- oder Suffix-Erzeugung. Das Suffix ist ein Argument.
- Kein Netzwerk, kein `safeStorage`, keine neuen IPC-Kanäle, keine Preload-Änderung.
- Keine UI, keine Vue-Datei.
- Keine neuen Abhängigkeiten.

## Fallen aus docs/REVIEW-NOTES.md

- Punkt 11: **Nur** `src/utils/upn.js` des Referenzprojekts ist autoritativ. Die PowerShell-
  Variante weicht ab und ist nicht die Vorlage.
- Punkt 12: Die Split-Heuristik an `/[-\s]/` aus den Remove-Views gehört **nicht** in die
  Erzeugung. Bindestriche und Leerzeichen werden ersatzlos gelöscht.
- `[S01]`-Einträge: keine bedingten Tests; Sicherheits- und Korrektheitszusagen verhaltensbasiert
  prüfen statt per Quelltext-Regex; bei Mengen- und Verzeichnisprüfungen **Verbotenes** aufzählen;
  Event-/API-Signaturen gegen die Typdefinition prüfen statt zu raten.
