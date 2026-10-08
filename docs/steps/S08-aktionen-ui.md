# S08 — Aktionen, Dry-Run und Bestätigungen

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §3, §5, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md` (37 Einträge).

## Ziel

Der Admin wählt User aus, wählt eine Aktion, sieht eine **Vorschau**, bestätigt und sieht
Fortschritt plus Ergebnisbericht mit CSV-Export. Zwei Durchläufe: **A** = pur + Dateidialog,
**B** = Renderer.

---

## A1. `src/shared/dryRun.js`

```js
planActions({ users, auswahl, action, params, adminUserId })
  -> { auszufuehren: Plan[], keineAenderung: Plan[], ausgeschlossen: Plan[], anzahl: number }
```
`Plan = { userid, vorher: string|null, nachher: string|null, grund?: messageId }`

- **Rein lokal.** Gerechnet wird auf der **schon geladenen** `users`-Liste, **kein** Request
  (DECISIONS „Dry-Run-Semantik").
- **`anzahl === auszufuehren.length`.** Das ist die Zahl, die beim Löschen eingetippt werden
  muss — **nicht** die Größe der Rohauswahl.
- **No-Ops landen in `keineAenderung`** und werden **nicht** ausgeführt:
  - `user.enable` auf einen bereits aktiven User
  - `user.disable` auf einen bereits deaktivierten User
  - `user.addToGroup` auf einen User, der **schon** in der Gruppe ist
  - `user.removeFromGroup` auf einen User, der **nicht** in der Gruppe ist
  - `user.setQuota` mit einem Wert, der dem aktuellen `limitBytes` entspricht
    (bzw. `unbegrenzt` bei `kind === 'unlimited'`)
  - `user.update` ohne geändertes Feld
- **Selbstschutz** (DECISIONS): bei `user.delete` und `user.disable` landet der **verbundene
  Admin** in `ausgeschlossen` mit `grund: 'selbstschutz_admin'`. Vergleich über
  `istVerbundenerAdmin`, also case-insensitiv.
- `user.setPassword` und `user.delete` haben **keine** No-Op-Erkennung — sie sind immer
  auszuführen (ein Passwort ist nicht lesbar, ein Löschen nie wirkungslos).
- `vorher`/`nachher` sind **Anzeigetexte** für die Vorschautabelle, erzeugt mit den
  bestehenden puren Funktionen (`formatBytes` für Kontingente). Kein eigenes Formatieren.

## A2. `src/shared/quota.js` erweitern

```js
QUOTA_PRESETS            // [{ id, label, bytes|null }]
formatQuotaForApi(preset) -> string   // Bytes als String, oder 'none'
```
Presets: 1, 2, 5, 10, 20 GB und **unbegrenzt**. GiB-Basis **1073741824**
(DECISIONS „Kontingent-Eingabe": nur Presets, kein Freitext).
`unbegrenzt` wird als **`'none'`** gesendet.

## A3. `src/shared/resultCsv.js`

```js
buildResultCsv(results) -> string
```
Spalten **genau und in dieser Reihenfolge** (DECISIONS „Ergebnis-CSV Spalten"):
`userid;aktion;status;grund;httpStatus;ocsCode`
- Trennzeichen `;`, Kopfzeile vorhanden, Zeilenende `\r\n`, UTF-8 **mit BOM**
  (sonst zerlegt Excel Umlaute).
- `grund` ist der **deutsche Text** aus `messages.js`, nicht die messageId.
- Felder, die `;`, `"` oder einen Zeilenumbruch enthalten, werden in `"` gesetzt und innere
  `"` verdoppelt. **Pflichttest** mit einem `grund`, der ein `;` enthält.
- `null` wird zu einem leeren Feld, **nicht** zum Text `"null"`.

## A4. `src/main/files.js` + IPC
- `files.saveCsv` (invoke) `{ vorschlag, inhalt }` -> `{ ok, path }` bzw.
  `{ ok: false, messageId: 'abgebrochen' }`.
- `dialog.showSaveDialog`, **nur nutzergewählter Pfad**, **kein** Default im App-Verzeichnis,
  **kein** Auto-Open (DECISIONS).
- Schreibfehler -> `messageId: 'export_fehlgeschlagen'`.

---

## B. Renderer

### B1. `components/ActionBar.vue`
Sichtbar, sobald die Auswahl nicht leer ist. Aktionsauswahl, Parameterfelder je Aktion
(Gruppen-Dropdown, Kontingent-Preset-Dropdown, Passwortfeld, Anzeigename/E-Mail),
Button „Vorschau".

### B2. Vorschau und Bestätigung (swal2)
Die Vorschau zeigt drei Blöcke: **auszuführen** (mit `vorher` -> `nachher`),
**keine Änderung** und **ausgeschlossen** (je mit Begründung).

- Normale Aktionen: swal2 Ja/Nein mit der Anzahl.
- **Löschen:** zusätzliche Eingabe der **Dry-Run-Zahl** (`anzahl`), getrimmt, exakter
  Stringvergleich; der Bestätigen-Button bleibt deaktiviert, bis sie übereinstimmt;
  kein Versuchslimit; gilt **auch bei n = 1** (DECISIONS).
  Der Dialog nennt ausdrücklich, dass **Nextcloud die Dateien der betroffenen User mitlöscht**
  (DECISIONS „Batch-Löschen: Hinweis auf Dateien").
- Ist `anzahl === 0`, wird **kein** Job gestartet; Hinweis „Keine Änderung nötig".

### B3. `components/JobProgress.vue`
Fortschritt aus `actions.onProgress` (feuert live, S07), „Abbrechen"-Button,
danach der Ergebnisbericht pro User mit Status und Begründung, plus Button
„Ergebnis als CSV speichern" — **auch nach einem Abbruch** (DECISIONS).
Zeigt `summary` als vier Zahlen; `teilweise` erscheint in der Fehlerspalte **und** separat.

### B4. `state.js`
`jobLaeuft`, `jobId`, `jobFortschritt`, `jobResults`, `jobSummary`, `dryRunPlan`.
Nach Jobende wird die Userliste **neu geladen** (die Daten sind jetzt veraltet).

---

## Neue messageIds
`selbstschutz_admin`, `abgebrochen`, `export_fehlgeschlagen`, `keine_aenderung_noetig`,
`bereits_aktiv`, `bereits_deaktiviert`, `bereits_in_gruppe`, `nicht_in_gruppe`,
`kontingent_unveraendert`, `keine_felder_geaendert`.

## Abnahmekriterien (automatisiert, ~35 Tests)

1. `planActions`: je ein No-Op-Fall pro Aktion aus A1, jeweils in `keineAenderung`
   **und nicht** in `auszufuehren`.
2. **`anzahl === auszufuehren.length`** und ungleich der Rohauswahl, wenn No-Ops oder
   Ausgeschlossene dabei sind. **Pflichttest:** Auswahl 5, davon 2 No-Ops und 1 Selbstschutz
   -> `anzahl === 2`.
3. **Selbstschutz** bei `delete` und `disable`, case-insensitiv (`Aaron.w` vs. `aaron.w`);
   bei `user.enable` ist der Admin **nicht** ausgeschlossen.
4. `planActions` führt **keinen** Request aus (Test mit einem `client`, dessen `request`
   ein werfender Spy ist, der nie aufgerufen werden darf).
5. `formatQuotaForApi`: jedes Preset in Bytes mit Basis 1073741824; `unbegrenzt` -> `'none'`.
6. `buildResultCsv`: exakte Kopfzeile; sechs Spalten in der Reihenfolge; `grund` als deutscher
   Text; `null` als leeres Feld; **Quoting-Test mit `;` im `grund`**; BOM vorhanden; `\r\n`.
7. `files.saveCsv`: Abbruch im Dialog -> `abgebrochen`; Schreibfehler ->
   `export_fehlgeschlagen`; Erfolg -> `{ ok: true, path }`. `electron` und `node:fs/promises`
   gemockt.

**Manuell** (in `docs/MANUAL-TEST.md`): Vorschau mit allen drei Blöcken; Löschen mit falscher
und richtiger Zahl; Hinweis auf Dateilöschung; Admin erscheint ausgeschlossen; Abbruch mitten
im Job; CSV-Export nach Abbruch; Liste wird nach Jobende neu geladen.

## Ausdrücklich NICHT
- Kein CSV-**Import**, keine Username-Erzeugung, kein Initialpasswort (S09-S11).
- Keine Gruppenverwaltung (S12), kein Dashboard (S13), keine Job-Historie.
- Kein Freitext-Kontingent, keine Profilliste.
- Keine Batch-Aktion „Einstellungen ändern" (gestrichen).
- Kein `files.openCsv` — nur Speichern. Öffnen kommt in S09.
- Keine neuen Abhängigkeiten.
