# S11 — Import ausführen und Ergebnis-Export

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §3, §5, §6, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md` (51 Einträge).

## Ziel

Die in S10 gezeigte Vorschau wird ausgeführt: pro Zeile ein User anlegen, optional Gruppen
zuweisen, Fortschritt zeigen, Ergebnisbericht mit **Username und Initialpasswort** exportieren.

Läuft über die **bestehende** Action-Pipeline aus S07. Kein zweiter Ausführungspfad.

## A1. `src/main/ocs/users.js` erweitern

```js
createUser(client, { userid, password, displayName, quota })   // POST /cloud/users
```
Eigene lokale Fehlercode-Map (RESEARCH-OCS §5, **User anlegen**):
`101` ungültiges Argument · `102` `benutzer_existiert_bereits` · `104` Gruppe existiert nicht ·
`105` keine Rechte für Gruppe · `107` `passwort_policy` · `111` `userid_nicht_erzeugbar`.
`108`/`110` (E-Mail erforderlich) können nicht auftreten, weil wir **immer** ein Passwort setzen
— trotzdem mappen, falls eine Instanz anders konfiguriert ist.

**`groups[]` wird NICHT im `POST` mitgesendet.** Begründung unten.

## A2. `user.create` ist ein **zweistufiger** Vorgang

In `operations.js`:
1. `createUser` mit `userid`, `password`, `displayName`, `quota`.
2. **Je Zielgruppe** ein `addUserToGroup`.

Grund (ARCHITECTURE §5): Würden die Gruppen im `POST` mitgesendet, wäre ein Gruppenfehler
nicht von einem Anlege-Fehler zu unterscheiden — der User wäre angelegt, die Antwort hieße aber
„fehlgeschlagen". Getrennt ergibt ein Gruppenfehler **`teilweise`**, und `grund` benennt die
Gruppe, die nicht zugewiesen werden konnte.

- Schritt 1 scheitert -> `fehler`, Schritt 2 wird **nicht** versucht.
- Schritt 1 ok, eine Gruppe scheitert -> **`teilweise`** mit Nennung der Gruppe.
- Kein Rollback (DECISIONS: ausdrücklich kein Rollback). Der Admin lässt erneut laufen;
  bestehende User fallen dann in `benutzer_existiert_bereits`.

## A3. `src/shared/resultCsv.js` erweitern

Der **Import**-Export hat eine **siebte** Spalte `passwort`
(DECISIONS „Ergebnis-CSV: Spalten des Import-Exports"):
`userid;aktion;status;grund;httpStatus;ocsCode;passwort`
Spalten 1-6 bleiben identisch zum Batch-Bericht. Sonst alles wie dort: `;`, CRLF, BOM,
Quoting bei `;`/`"`/Zeilenumbruch, `null` als leeres Feld.

**Umfang** (DECISIONS „Import-Ergebnis-Export Umfang"): Pipeline-Ergebnisse **plus** die in der
Vorschau abgewiesenen Fehlerzeilen.
**Spalte 1 bei Zeilen ohne Username:** `Zeile n`. Jede Eingabezeile ist damit genau einmal
auffindbar.

## B. Renderer — `ImportView.vue` erweitern

### B1. Ausführen
Der „Anlegen"-Button startet einen Job über `actions.run` mit `action: 'user.create'`:
- `items` sind die Usernames der Zeilen mit Status `neu` oder `kollision_aufgeloest` —
  **nie** Fehlerzeilen.
- Pro Item die Parameter aus der Vorschauzeile (Passwort, Anzeigename) plus die global
  gewählten Zielgruppen und das Kontingent.
- **Vorher swal2-Bestätigung** mit der Anzahl. Keine Zahleneingabe (das ist nur beim Löschen).

### B2. Fortschritt und Bericht
`JobProgress.vue` **wiederverwenden**, nicht nachbauen. Nach Jobende:
- Bericht pro Zeile mit Status und Begründung.
- Button „Ergebnis als CSV speichern" (`bi-download`).
- **Vor dem Speicherdialog eine swal2-Warnung**, dass die Datei **Initialpasswörter im
  Klartext** enthält (DECISIONS „Passwort-Export auf Platte"). Nur nutzergewählter Pfad,
  kein Default im App-Verzeichnis, **kein** Auto-Open.

### B3. Danach
- Die Userliste wird **neu geladen** (die angelegten User fehlen sonst in der Tabelle).
- **Die Passwortliste wird nach dem Export bzw. beim Verlassen der Ansicht aus `state.js`
  entfernt** — das ist in S10 schon umgesetzt, hier nur nicht kaputt machen.

## Neue messageIds
`userid_nicht_erzeugbar`, `import_bestaetigen`, `passwort_export_warnung`.

## Abnahmekriterien (automatisiert, ~20 Tests)

1. `createUser`: Erfolg; `102` -> `benutzer_existiert_bereits`; `107` -> `passwort_policy`;
   `111` -> `userid_nicht_erzeugbar`; ein `kind: 'auth'` behält seine `messageId`.
   Der Request enthält `userid`, `password`, `displayName`, `quota` — und **kein** `groups[]`.
2. **`user.create` ist zweistufig:** ein Test belegt, dass bei zwei Zielgruppen **drei**
   Requests laufen (1 Anlegen + 2 Gruppen) und die Reihenfolge stimmt.
3. **Teilfehler:** Anlegen ok, zweite Gruppe scheitert -> `status: 'teilweise'`,
   und `grund` **nennt die Gruppe**.
4. **Erster Schritt scheitert -> `fehler`, und es wird kein Gruppen-Request gesendet**
   (am Request-Zähler gemessen, nicht am Status — REVIEW-NOTES `[S07]`).
5. **Teilfehler bricht den Import nicht ab:** Zeile 3 scheitert, Zeilen 1, 2, 4, 5 werden
   angelegt. Pflichttest aus GOAL „Abnahme".
6. `buildResultCsv` mit Passwortspalte: sieben Spalten in der dokumentierten Reihenfolge;
   Spalten 1-6 identisch zum Batch-Bericht; `Zeile n` in Spalte 1, wenn kein Username vorliegt;
   abgewiesene Vorschauzeilen sind enthalten.
7. **Jede Eingabezeile erscheint genau einmal im Export** — Pipeline-Ergebnisse plus
   Vorschaufehler, keine Dublette, keine fehlende.

**Manuell** (in `docs/MANUAL-TEST.md`): echten Import mit 3-5 Zeilen gegen
`cloud.xapient.solutions`; eine Zeile mit absichtlich zu schwachem Prefix (-> `107`);
Gruppenzuweisung prüfen; Export öffnen und Passwörter kontrollieren; Warnung vor dem Speichern;
Userliste danach aktualisiert; Re-Import derselben Datei ergibt überall
`benutzer_existiert_bereits`.

## Ausdrücklich NICHT
- Kein Rollback, keine Kompensation (DECISIONS).
- **Kein `groups[]` im `POST`** — siehe A2.
- Keine Gruppenverwaltungs-Ansicht (S12), kein Dashboard (S13).
- **Kein zweiter Ausführungspfad.** `actions.run`, `pipeline.js`, `JobProgress.vue` und
  `resultCsv.js` werden **wiederverwendet**. Fällt dort ein Fehler auf: melden, nicht umbauen.
- **Keine Berechnung in `.vue`-Dateien** (`[S06]`, inzwischen viermal verletzt): kein `Set`,
  `sort`, `filter`, `reduce`, `map`, `localeCompare`. Abgeleitetes als benannte pure Funktion
  nach `src/shared/` **mit Test**.
- Keine neuen Abhängigkeiten.
