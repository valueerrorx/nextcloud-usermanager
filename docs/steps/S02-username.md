# S02 — Username-Generator (pur)

Status: spec
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
                          username.js erzeugen kann. Wächst in Folgeschritten.
tests/username.test.js
tests/messages.test.js
```

## Exportierte API — verbindlich, keine Abweichung

```js
export const MAX_USERID = 64;             // RESEARCH-OCS §7, defensiv
export const ORDER_GIVEN_FIRST  = 'givenFirst';
export const ORDER_SURNAME_FIRST = 'surnameFirst';

normalizeOrder(order)                  -> 'givenFirst' | 'surnameFirst'
normalizeComponent(text)               -> string
buildUsername(vorname, nachname, order) -> string        // '' wenn eine Komponente leer
truncateToFit({ first, second, suffix, max }) -> { second, gekuerzt, passt }
validateUserid(s, { quelle })          -> { ok, messageId? }
```

## 1. `normalizeComponent` — exakte Portierung

Die Schritte laufen **in dieser Reihenfolge**. `docs/RESEARCH-UPN.md` §1 ist autoritativ und
enthält die Regexe; portiere sie buchstäblich, nicht „äquivalent umgeschrieben".

1. Falsy-Input (`''`, `null`, `undefined`, `0`) -> `''`, sofortiger Rücksprung.
2. `String(text)`-Coercion.
3. Umlaute/Eszett: `ä/Ä->ae`, `ö/Ö->oe`, `ü/Ü->ue`, `ß->ss`.
4. Akzentuierte Vokale, Groß- und Kleinform, je Gruppe:
   `àáâãăÀÁÂÃĂ->a`, `èéêëÈÉÊË->e`, `ìíîïÌÍÎÏ->i`, `òóôõÒÓÔÕ->o`, `ùúûÙÚÛ->u`, `ýÿȳÝŸȲ->y`.
5. Konsonanten: `çćčÇĆČ->c`, `ñÑ->n`, `žŽ->z`, `šŠ->s`, `đĐ->d`.
6. `normalize('NFD')`, dann Entfernen aller Zeichen **U+0300 bis U+036F**.
7. `toLowerCase()`.
8. Whitelist-Strip: alles außer `a-z`, `0-9` und `.` wird **gelöscht, nicht ersetzt**.

Folgen, die getestet werden müssen: Leerzeichen und Bindestriche verschwinden ersatzlos,
Apostrophe ebenso, **Punkte bleiben erhalten**, Ziffern bleiben, nicht-lateinische Schriften
ergeben `''`.

**Reihenfolge ist nicht verhandelbar.** Schritt 6 nach 3-5 bedeutet: `ä` wird `ae`, nicht `a`.
Ein Test muss genau das absichern, sonst ist der Port falsch und niemand merkt es.

## 2. `buildUsername`

- Trenner ist ein Punkt.
- `givenFirst` (Default) -> `vorname.nachname`, `surnameFirst` -> `nachname.vorname`.
- `normalizeOrder` fällt bei **jedem** unbekannten Wert auf `givenFirst` zurück.
- Ist eine der **normalisierten** Komponenten leer -> Rückgabe `''`. Kein Teil-Username.
- **Keine Domain.** Das Referenzprojekt hängt `@domain` an; das entfällt hier vollständig.

## 3. `truncateToFit`

```
Budget für second = max - first.length - 1 (Trennpunkt) - suffix.length
```
- Budget `>= second.length` -> unverändert, `{ gekuerzt: false, passt: true }`.
- Budget `>= 1` -> `second` von rechts auf das Budget schneiden,
  `{ gekuerzt: true, passt: true }`. Nachname behält **mindestens 1 Zeichen**.
- Budget `< 1` -> `{ passt: false }` -> Aufrufer erzeugt `username_zu_lang`.

`first` ist **fest der Vorname**, `second` **fest der Nachname** — nicht „links/rechts",
unabhängig von `order`. `first` wird nie gekürzt und daher nicht zurückgegeben.
Die Funktion ist **reihenfolgeunabhängig**, weil nur Längen zählen.
`suffix` ist `''` oder `'.ddmmyyyy'` (9 Zeichen); S02 erzeugt das Suffix **nicht**, es kommt
als Argument.

## 4. `validateUserid(s, { quelle })`

Gemeinsam geprüft: nicht leer, nicht nur Punkte, Länge `<= MAX_USERID`, keine reservierten Namen.

Zeichensatz **unterschiedlich**, das ist Absicht (DECISIONS „Zeichensatz für manuell eingegebene `userid`"):
- `quelle: 'generator'` -> `[a-z0-9.]`. Regressionssperre; der Generator erzeugt nichts anderes.
- `quelle: 'manuell'` -> `[A-Za-z0-9_.@-]`. Keine Leerzeichen, kein Apostroph, obwohl Nextcloud
  beide zulässt — sie provozieren Quoting-Fehler in URLs, CSV und Shell.

Reservierte Namen (`RESERVED_USERIDS`, aus RESEARCH-OCS §7), case-insensitiv:
`.htaccess`, `files_external`, `__groupfolders`, `.ncdata`, `owncloud.log`, `nextcloud.log`,
`updater.log`, `audit.log`. Zusätzlich jeder Name, der mit `appdata_` beginnt — die echte
Instanz-ID ist unbekannt, deshalb Präfixprüfung.

Fehler-IDs: `userid_leer`, `userid_nur_punkte`, `userid_zu_lang`, `userid_zeichen`,
`userid_reserviert`. Jede muss in `messages.js` einen deutschen Text haben.

## 5. `messages.js`

`messageId -> deutscher Text`, die **einzige** Quelle für UI-Texte.
In S02 nur die fünf IDs oben. Keine Platzhalter für spätere Schritte anlegen.

## Abnahmekriterien (alle automatisiert)

1. **Alle 14 Zeilen aus `docs/RESEARCH-UPN.md` §11** als Tabellentest, beide Reihenfolgen,
   inklusive der zwei `''`-Fehlerfälle (CJK und leerer Vorname).
2. **Alle 5 Fixtures aus `docs/RESEARCH-UPN.md` §10**, ohne `@domain`:
   `normalizeOrder('nope') === 'givenFirst'`; `buildUsername('max','mustermann',…)` in beiden
   Reihenfolgen; `buildUsername('Max','Müller',…)` -> `max.mueller` bzw. `mueller.max`.
3. **Reihenfolge der Normalisierung belegt**: ein Test, der fehlschlägt, wenn Schritt 6 vor
   Schritt 3 liefe (z. B. `Müller` -> `mueller`, nicht `muller`).
4. `truncateToFit` mit Budget `>= second.length`, `>= 1` und `< 1`, mit und ohne Suffix,
   und ein Test, der die **Reihenfolgeunabhängigkeit** belegt: gleiche Längen, beide `order`,
   gleiches `second`-Ergebnis.
5. `validateUserid` für beide `quelle`-Werte: `müller!`, `...`, `''`, `.htaccess`,
   `appdata_abc`, 65 Zeichen, `max_mueller` (manuell ok, generator nicht), `Max` (manuell ok).
6. **Keine I/O**: ein Test beweist, dass `username.js` nichts aus `node:*`, `electron` oder
   `vue` importiert und `fetch` nicht verwendet.
7. `messages.test.js`: jede von `username.js` erzeugbare messageId hat einen nicht-leeren
   deutschen Text, und `messages.js` enthält **keine** unbenutzten IDs.
8. `npm test` und `npm run lint` grün.

## Ausdrücklich NICHT in diesem Schritt

- Kein `birthdate.js`, kein `csvImport.js`, kein `importPlan.js`. Das Suffix kommt als Argument.
- Keine Kollisionsauflösung, kein Identitäts-Register, keine Vorschauzeilen, keine Fehler-IDs
  des Imports (`benutzer_existiert_bereits` etc.).
- Kein Netzwerk, kein `safeStorage`, keine IPC-Kanäle, keine Änderung am Preload.
- Keine UI, keine Vue-Datei, keine Anzeige des Generators.
- Kein `quota.js`, `pool.js`, `dryRun.js` oder sonstiges `src/shared/`-Modul.
- Keine neuen Abhängigkeiten.

## Fallen aus docs/REVIEW-NOTES.md, die hier gelten

- Punkt 11: **Nur die JS-Variante** `src/utils/upn.js` des Referenzprojekts ist autoritativ.
  Die PowerShell-Variante weicht ab und ist nicht die Vorlage.
- Punkt 12: Die Split-Heuristik an `/[-\s]/` aus den Remove-Views gehört **nicht** in die
  Erzeugung. Bindestriche und Leerzeichen werden ersatzlos gelöscht.
- `[S01]`-Einträge: keine bedingten Tests; Zusicherungen verhaltensbasiert prüfen, nicht per
  Quelltext-Regex; bei Verzeichnis- oder Mengenprüfungen **Verbotenes** aufzählen.

## Hinweis für Coder und Tester

Du brauchst das Referenzprojekt **nicht** zu öffnen. `docs/RESEARCH-UPN.md` ist die autoritative
Spezifikation und enthält die Regexe, die Reihenfolge und die 14 nachgerechneten Beispiele.
Falls du dort eine Lücke findest, melde sie — rate nicht.
