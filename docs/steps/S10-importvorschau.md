# S10 — Importvorschau

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §3, §6, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md` (48 Einträge), `docs/steps/S09a-ui-designsystem.md` für den Look.

## Ziel

CSV wählen, Optionen setzen, **Vorschau sehen**. Das tatsächliche Anlegen ist S11.
Die Vorschau nutzt den in S09 fertigen, puren `buildImportPlan` — hier kommt **keine** neue
Importlogik dazu.

## A. Main-Prozess

### A1. `src/main/files.js` erweitern
`files.openCsv` (invoke) `{ zweck: 'import' | 'userliste' }` -> `{ ok, path, text }`
- `dialog.showOpenDialog`, Filter auf `.csv`, Einfachauswahl.
- Als **UTF-8** lesen. Abbruch -> `{ ok: false, messageId: 'abgebrochen' }`.
- Lesefehler -> `messageId: 'datei_lesen_fehlgeschlagen'`.
- **Der gesamte Rumpf liegt in einem `try/catch`** — invoke-Kanäle werfen nie
  (ARCHITECTURE §3; das war in S08 ein CRITICAL).

### A2. `src/main/ocs/groups.js` (neu)
```js
listGroups(client)              // GET /cloud/groups        -> data.groups (Array)
createGroup(client, groupid)    // POST /cloud/groups
```
Je Funktion eine **eigene** lokale Fehlercode-Map plus `mapOcsError`, keine globale Tabelle.
Aus RESEARCH-OCS §5: **Anlegen** `101` ungültige Eingabe · `102` Gruppe existiert schon ·
`103` Anlegen fehlgeschlagen.
Response-Shape ist verifiziert: `data.groups` ist ein **Array** (RESEARCH-OCS V4).
`groupid` im Pfad bzw. Body korrekt kodieren.

### A3. IPC und Preload
- `groups.list` -> `{ ok, groups: string[] }`; ohne Verbindung -> `nicht_verbunden`.
- `groups.create` `{ groupid }` -> `{ ok }`.
- `files.openCsv` wie A1.
- Alle drei **namentlich** im Preload.

## B. Renderer — `ImportView.vue`

Aufbau im Designsystem aus S09a (Karten, Icons, Badges).

### B1. Schritt 1: Datei
Button „CSV wählen" (`bi-upload`). Danach Dateiname und Zeilenanzahl anzeigen.
Dateifehler (`datei_leer`, `nur_header`, `header_fehlt`, `zeilenlimit`, `quote_unbalanciert`)
erscheinen als deutscher Text **statt** der Tabelle — nicht als leere Vorschau.

### B2. Schritt 2: Optionen
- **Passwort-Prefix** (Pflicht). Validierung über `validatePrefix` **live bei jeder Eingabe**,
  mit Fehlertext darunter. Daneben das **Live-Beispiel** aus `beispielPasswort(prefix)`
  (z. B. `Schule01012010!`) — sichtbar, damit der Admin das Format vor dem Anlegen sieht.
- **Reihenfolge** als Umschalter: `vorname.nachname` / `nachname.vorname`
  (DECISIONS „Username-Format des Generators").
- **Zielgruppen** (optional, Mehrfachauswahl) — **nur aus der vom Server geladenen Liste**.
  Dazu ein Button „Gruppe neu anlegen" (`bi-people`), der per swal2 nach dem Namen fragt,
  `groups.create` ruft und die Liste neu lädt. **Kein Freitext**, damit OCS `104`
  (Gruppe existiert nicht) mitten im Import nicht auftreten kann (DECISIONS).
- **Kontingent** (optional) aus `QUOTA_PRESETS`.

### B3. Schritt 3: Vorschautabelle
Spalten: **Zeile · Vorname · Nachname · Geburtsdatum · Username · Status · Begründung**.
- Status als Badge: `neu` (grün), `kollision_aufgeloest` (gelb), `fehler` (rot).
- Ist `gekuerzt` gesetzt, ein eigenes Zeichen/Badge daneben — der Admin muss sehen,
  dass der Nachname beschnitten wurde.
- Bei `fehler` der **deutsche Text** aus `messages.js`, nicht die ID.
- Kopfzeile mit Zusammenfassung: `neu` / `Kollision aufgelöst` / `Fehler` als drei Zahlen.
- Leere Vorschau nach gültiger Datei darf nicht vorkommen; gibt es nur Fehlerzeilen, werden
  genau die gezeigt.

### B4. Schritt 4: Anlegen-Button
Beschriftet mit der Anzahl der tatsächlich anzulegenden Zeilen
(`summary.neu + summary.kollisionAufgeloest`).
**Deaktiviert**, solange: kein Prefix gültig, **oder** diese Anzahl `0` ist.
Der Klick macht in S10 **noch nichts** außer einem Platzhalter-Hinweis — das Anlegen ist S11.

### B5. `state.js`
`importDatei`, `importRows`, `importPlanRows`, `importSummary`, `importPrefix`,
`importOrder`, `importGruppen`, `importQuota`, `importFehler`.

## Neue messageIds
`datei_lesen_fehlgeschlagen`, `gruppe_existiert`, `gruppe_anlegen_fehlgeschlagen`,
`gruppenliste_fehlgeschlagen`.

## Abnahmekriterien

**Automatisiert (~20 Tests):**
1. `listGroups`: Erfolg liefert das Array aus `data.groups`; `kind: 'auth'` behält seine
   `messageId`; ohne Verbindung -> `nicht_verbunden`.
2. `createGroup`: `102` -> `gruppe_existiert`; `101`/`103` -> `gruppe_anlegen_fehlgeschlagen`;
   Erfolg -> `{ ok: true }`. `groupid` korrekt kodiert (Test mit Sonderzeichen).
3. `files.openCsv`: Abbruch -> `abgebrochen`; Lesefehler -> `datei_lesen_fehlgeschlagen`;
   Erfolg -> `{ ok: true, path, text }`. **Ein Test belegt, dass der Kanal auch bei einem
   Fehler im Dialog nicht wirft.**
4. Die drei neuen IPC-Kanäle sind registriert und im Preload **namentlich** vorhanden,
   ohne generischen Durchgriff.

**Manuell** (in `docs/MANUAL-TEST.md`): CSV wählen; Datei mit Fehler; Prefix ungültig und gültig
mit Live-Beispiel; Reihenfolge umschalten und sehen, dass sich die Usernames ändern;
Gruppe neu anlegen; Vorschau mit allen drei Statusfarben; `gekuerzt`-Kennzeichnung;
Anlegen-Button bleibt bei 0 anzulegenden Zeilen deaktiviert.

## Ausdrücklich NICHT
- **Kein Anlegen von Usern**, kein `POST /cloud/users`, kein Ergebnis-Export (S11).
- Keine Gruppenverwaltungs-Ansicht (S12) — nur Liste lesen und anlegen für den Import.
- Kein Dashboard.
- **Keine neue Importlogik.** `buildImportPlan`, `parseImportCsv`, `validatePrefix`,
  `beispielPasswort` werden **aufgerufen**, nicht verändert. Fällt dabei ein Fehler in S09 auf,
  melden statt reparieren.
- **Keine Berechnung in `.vue`-Dateien** (REVIEW-NOTES `[S06]`): kein `Set`, `sort`, `filter`,
  `reduce`, `localeCompare`. Abgeleitetes gehört als benannte pure Funktion nach `src/shared/`
  mit Test.
- Keine neuen Abhängigkeiten.
