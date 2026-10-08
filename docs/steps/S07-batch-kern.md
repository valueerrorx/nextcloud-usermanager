# S07 — Batch-Kern (pur + gemockt)

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §3, §5, `docs/REVIEW-NOTES.md` (32 Einträge).

## Ziel

Die Action-Pipeline: eine Auswahl von Usern wird über eine Aktion abgearbeitet, mit Parallelität 4,
Fortschritt, Abbruch und einem Ergebnis pro Item. **Kein UI, keine Bestätigungen, kein Dry-Run,
kein CSV-Export** — das ist S08.

`src/shared/pool.js` existiert bereits aus S05 und wird hier **wiederverwendet**, nicht neu gebaut.

## A1. `src/main/ocs/users.js` erweitern

Je Funktion eine **eigene** lokale Fehlercode-Map plus `mapOcsError`. Keine globale Tabelle.
`userid` immer mit `encodeURIComponent` im Pfad.

| Funktion | Request |
|---|---|
| `enableUser(client, userid)` | `PUT /cloud/users/{id}/enable` |
| `disableUser(client, userid)` | `PUT /cloud/users/{id}/disable` |
| `deleteUser(client, userid)` | `DELETE /cloud/users/{id}` |
| `setUserField(client, userid, key, value)` | `PUT /cloud/users/{id}` mit `key`/`value` |
| `addUserToGroup(client, userid, groupid)` | `POST /cloud/users/{id}/groups` mit `groupid` |
| `removeUserFromGroup(client, userid, groupid)` | `DELETE /cloud/users/{id}/groups` mit `groupid` |

Fehlercodes aus RESEARCH-OCS §5: **Bearbeiten** `101` ungültiges Argument ·
`107` Passwort-Policy · `112` Backend unterstützt Passwortsetzen nicht ·
`113` Feld nicht editierbar. **Gruppen** `102` Gruppe existiert nicht ·
`103` kein Recht. Für Enable/Disable/Delete ist nur `100`/`101` belegt — `101` auf
`aktion_fehlgeschlagen` abbilden, alles andere über `kind` durchfallen lassen.

## A2. `src/main/actions/operations.js`

Bildet eine Action-ID auf **einen oder zwei** Schritte ab:

| Action-ID | Schritte |
|---|---|
| `user.enable` | 1: `enableUser` |
| `user.disable` | 1: `disableUser` |
| `user.delete` | 1: `deleteUser` |
| `user.setQuota` | 1: `setUserField(…, 'quota', wert)` |
| `user.setPassword` | 1: `setUserField(…, 'password', wert)` |
| `user.addToGroup` | 1: `addUserToGroup` |
| `user.removeFromGroup` | 1: `removeUserFromGroup` |
| `user.update` | **1-2**: `displayname` und/oder `email`, je ein `PUT` |

`user.update` ist der einzige mehrschrittige Fall, weil `PUT /cloud/users/{id}` nur **ein**
`key`/`value`-Paar nimmt. Werden beide Felder geändert, sind das zwei Requests — und genau
daraus entsteht `teilweise`.

Eine unbekannte Action-ID -> wirft (Programmierfehler, kein Laufzeitfall).

## A3. `src/main/actions/pipeline.js`

```js
runJob({ jobId, action, items, params, client, shouldStop, onProgress })
  -> { ok: true, results: ItemResult[], summary }
```

- `items` sind `userid`-Strings.
- Abarbeitung über `runPool(items, worker, { concurrency: 4, shouldStop })`.
- **`shouldStop` wird injiziert.** `pipeline.js` liest **nicht** das `session`-Singleton
  (ARCHITECTURE §5, und dieselbe Begründung wie beim OCS-Client).
- `onProgress({ jobId, done, total, result })` nach **jedem** Item.
- **Jedes Item erscheint genau einmal** im Ergebnis.

`ItemResult`:
```js
{ userid, aktion, status: 'ok'|'fehler'|'nicht ausgeführt'|'teilweise',
  grund: string|null, httpStatus: number|null, ocsCode: number|null }
```

- Alle Schritte erfolgreich -> `ok`.
- Erster Schritt scheitert -> `fehler`, `grund` = `messageId` des Schritts.
- Bei zwei Schritten: erster ok, zweiter scheitert -> **`teilweise`**, und `grund` **benennt den
  fehlgeschlagenen Teilschritt** (z. B. `email konnte nicht gesetzt werden`).
- `shouldStop` wahr vor dem Dispatch -> `nicht ausgeführt`, **kein** Request.
- **Ein Einzelfehler bricht den Job nie ab** (GOAL-Abnahme verlangt das ausdrücklich).

`summary = { ok, fehler, nichtAusgefuehrt, teilweise }`.

### Was passiert bei 429
Der Client wiederholt bereits zweimal mit Backoff. Sind die Retries erschöpft, ist das ein
**normaler Item-Fehler** mit `grund: 'server_blockt_vorerst'` — der Job **läuft weiter**.
**Kein Pausendialog** (DECISIONS: gestrichen), **kein Jobabbruch**, und ein 429 wird nicht als
„User fehlerhaft" fehlinterpretiert, sondern trägt seine eigene Begründung.

## A4. `src/main/session.js` erweitern
- Jobzustand pro `jobId`: `'laufend' | 'beendet'`, **bleibt** nach Jobende erhalten.
- Stop-Flag pro `jobId`, wird im `finally` freigegeben.
- `actions.stop` liefert `'gestoppt'` (Zustand `laufend`), `'bereits_beendet'`
  (Zustand `beendet`) oder `'unbekannt'` (jobId nie gesehen).
  Ohne den **bleibenden** Zustand könnte ein beendeter Job nicht von einem nie gestarteten
  unterschieden werden.

## A5. IPC und Preload
- `actions.run` (invoke) -> `{ ok: true, results, summary }`. **Nie global fehlerhaft** —
  Fehler stehen je Item. Ohne Verbindung -> `{ ok: false, messageId: 'nicht_verbunden' }`.
- `actions.stop` (invoke) -> `{ ok: true, zustand }`.
- `actions.onProgress` (main->renderer).
- `ipc.js` umschließt `runJob` mit `try/finally`, setzt den Jobzustand auf `'beendet'` und gibt
  das Stop-Flag frei — auch wenn `runJob` wirft.
- Preload: alle drei **namentlich**, Event-Abo mit Disposer.

## Neue messageIds
`aktion_fehlgeschlagen`, `feld_nicht_editierbar`, `passwort_policy`,
`passwort_backend_nicht_unterstuetzt`, `gruppe_existiert_nicht`, `kein_recht_fuer_gruppe`,
`unbekannte_aktion`. Texte vom Coder, kurz und ohne Fachjargon.

## Abnahmekriterien (automatisiert, ~30 Tests)

1. **Der Lastfall:** 50 Items, davon 7 mit Fehler, eines mit einem erschöpften 429, Abbruch
   (`shouldStop` wird wahr) bei Item 20. Geprüft wird:
   jedes der 50 Items erscheint **genau einmal**; die Items ab dem Abbruch sind
   `nicht ausgeführt` und haben **keinen** Request ausgelöst; das 429-Item hat
   `status: 'fehler'` mit `grund: 'server_blockt_vorerst'`; der Job endet mit `ok: true`;
   `summary` zählt korrekt und die vier Zahlen addieren sich zu 50.
2. **Parallelität 4:** ein Zähler belegt, dass nie mehr als 4 Worker gleichzeitig laufen.
3. **`teilweise`:** `user.update` mit `displayname` **und** `email`, wobei der zweite `PUT`
   scheitert -> `status: 'teilweise'`, und `grund` benennt **welcher** Teilschritt scheiterte.
   Zusätzlich: scheitert der **erste** Schritt, ist der Status `fehler` und der zweite Request
   wird **nicht** gesendet.
4. **Einzelfehler bricht nicht ab:** Item 1 scheitert, Items 2-5 laufen trotzdem.
5. **`session`-Zustände:** `actions.stop` auf laufenden Job -> `gestoppt`; auf beendeten ->
   `bereits_beendet`; auf unbekannte jobId -> `unbekannt`. Nach Jobende ist das Stop-Flag frei,
   der **Zustand** aber noch vorhanden.
6. **`operations.js`:** jede Action-ID erzeugt die dokumentierten Requests (Methode, Pfad,
   Form-Felder per Mock geprüft); unbekannte ID wirft.
7. **Endpunkt-Fehlerkarten:** je ein Test, dass `113` zu `feld_nicht_editierbar` und `107` zu
   `passwort_policy` wird, und dass ein `kind: 'auth'` seine `messageId` **behält**.
8. **Pfad-Encoding:** eine `userid` mit Sonderzeichen landet kodiert im Pfad.
9. `actions.run` ohne Verbindung -> `nicht_verbunden`.

## Ausdrücklich NICHT
- Kein Dry-Run, kein `dryRun.js`, kein Selbstschutz, keine Bestätigungsdialoge,
  keine Zahleneingabe beim Löschen (S08).
- Kein `resultCsv.js`, kein CSV-Export (S08).
- Keine Aktionsleiste, kein `ActionBar.vue`, kein `JobProgress.vue`, **kein Renderer-Code**.
- Keine Job-Historie, keine Persistenz.
- Kein CSV-Import, keine Gruppenverwaltung, kein Dashboard.
- Keine neuen Abhängigkeiten. `pool.js` wird wiederverwendet, nicht geändert —
  es sei denn, ein Test deckt dort einen echten Fehler auf; dann melden.
