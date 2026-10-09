# S13 — Dashboard

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §4.1, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md` (57 Einträge).

## Ziel

Die Startseite zeigt Kennzahlen aus der **schon geladenen** Userliste — **ohne Zusatz-Requests**.
Letzter Schritt des Plans.

## ⚠ Dieselbe Falle wie S10 und S12

Alle Kacheln rechnen auf `state.users`. **Ohne geladene Liste zeigt das Dashboard lauter Nullen**
— und das sieht aus wie eine leere Instanz, nicht wie fehlende Daten.

Verbindlich, wie in S10 und S12:
- `DashboardView` **lädt die Userliste selbst**, wenn `state.users` leer ist.
- Bis dahin `StateBlock`, **keine** Kacheln mit Nullen.
- Zeitstempel des Datenstands anzeigen, „Neu laden"-Button.

## A. `src/shared/dashboard.js` (neu, pur)

Signaturen und Semantik stehen in **ARCHITECTURE §4.1** und sind verbindlich:
```js
storageTotals(users) -> { genutztBytes, summeBegrenztBytes, anzahlUnbegrenzt, anzahlUnbekannt }
istFastVoll(u)       -> boolean
fastVollListe(users, { max = 20 }) -> { eintraege: UserView[], weitere: number }
userCounts(users)    -> { gesamt, aktiv, deaktiviert }
historyCounts(summary) -> { ok, fehler, teilweise }
```

Die Regeln, die am leichtesten falsch gehen:
- `genutztBytes` summiert **alle** `usedBytes != null` — **auch bei `unlimited`**.
  Verifiziert: der Admin hat `quota: -3` und `used: 53983039299` (RESEARCH-OCS V3).
- `summeBegrenztBytes` summiert **nur** `kind === 'limited' && limitBytes > 0`.
  **Keine** Gesamtsumme bilden (DECISIONS „Dashboard-Kachel Speicher": vier Werte statt einer Summe).
- `istFastVoll`: `kind === 'limited' && limitBytes > 0 && usagePercent > 90`.
  `unlimited`, `unknown` und `limitBytes === 0` sind **ausgeschlossen**.
- `fastVollListe`: filtert, sortiert **absteigend** nach `usagePercent`, kappt bei `max`;
  `weitere` = Anzahl der Abgeschnittenen.
- `historyCounts`: `fehler = summary.fehler + summary.teilweise`, **und** `teilweise` zusätzlich
  separat (DECISIONS „`summary`-Form").

## B. Job-Historie

**Nur die laufende Sitzung, letzte 5, im Speicher** (DECISIONS „Dashboard Batch-Job-Historie":
keine Persistenzschicht). Nach Neustart leer.
- `state.js`: `jobHistorie` (Array, max 5, neueste zuerst).
- Nach Jobende hängt der Job-Pfad einen Eintrag an: Zeitpunkt, Aktionsname, `summary`.
- Dry-Runs erscheinen **nicht** (DECISIONS „Dry-Runs in der Job-Historie").
- Die Kachel zeigt pro Eintrag `ok` / `fehler` / `teilweise` über `historyCounts`.

## C. Renderer — `DashboardView.vue`

- Kacheln: **Benutzer** (gesamt / aktiv / deaktiviert), **Gruppen** (Anzahl),
  **Speicher** (die vier Werte), **Fast voll** (Liste), **Letzte Jobs**.
- Die Gruppenzahl kommt aus `state.groups`; ist sie leer, wird sie **mitgeladen**
  (gleiche Regel wie oben, keine „0 Gruppen" ohne Daten).
- **Rechnet nichts** (ARCHITECTURE §4.1, DECISIONS „Berechnungen gehören nie in
  Vue-Komponenten"): kein `Set`, `sort`, `filter`, `reduce`, `map`, `localeCompare`.
  Zahlen werden mit `formatBytes` / `formatPercent` aus `quota.js` formatiert.
- „Fast voll"-Liste mit Link-Charakter: Klick auf einen Eintrag wechselt zur Benutzeransicht.
  **Optional** — wenn es ohne Berechnung in der `.vue` nicht geht, weglassen.
- Leere „fast voll"-Liste zeigt einen definierten Empty-State, nicht eine leere Tabelle.
- `stat-card`-Styles aus S09a nachziehen (dort bewusst entfernt, weil ungenutzt).

## Abnahmekriterien (automatisiert, ~20 Tests)

**Pflichtfixture mit konkreten Werten** — daraus müssen sich die erwarteten Zahlen exakt ergeben:

| User | quota-Eingang | erwartet |
|---|---|---|
| `a.unbegrenzt` | `{ quota: -3, used: 1000 }` | `unlimited`, `usedBytes: 1000` |
| `b.unbekannt` | `{ quota: 0, used: 500 }` | `unknown` |
| `c.voll` | `{ quota: 1000, used: 950 }` | `limited`, 95 % |
| `d.halb` | `{ quota: 1000, used: 500 }` | `limited`, 50 % |

1. `storageTotals` für dieses Fixture: `genutztBytes === 2950` (1000 + 500 + 950 + 500 —
   **inklusive** unbegrenzt und unbekannt, sofern `usedBytes` gesetzt ist),
   `summeBegrenztBytes === 2000`, `anzahlUnbegrenzt === 1`, `anzahlUnbekannt === 1`.
   **Beachte:** Liefert `parseQuota` für `quota: 0` kein `usedBytes`, ist der erwartete Wert
   entsprechend `2450` — prüfe das am echten `parseQuota` und schreibe den **tatsächlichen**
   Wert in den Test, mit einer Zeile Begründung.
2. `istFastVoll`: `c.voll` -> `true`; `d.halb` -> `false`; `a.unbegrenzt` -> `false`;
   `b.unbekannt` -> `false`. **Grenzwerte: genau 90 % -> `false`, 90,1 % -> `true`.**
3. `fastVollListe` mit **25** Treffern und `max: 20`: `eintraege.length === 20`,
   `weitere === 5`, und `eintraege[0].quota.usagePercent >= eintraege[19].quota.usagePercent`
   (absteigend). Leere Liste -> `{ eintraege: [], weitere: 0 }`.
4. `userCounts`: 4 gesamt, bei zwei deaktivierten -> `aktiv: 2`, `deaktiviert: 2`.
5. `historyCounts` mit `{ ok: 3, fehler: 2, nichtAusgefuehrt: 1, teilweise: 4 }`
   -> `{ ok: 3, fehler: 6, teilweise: 4 }`.
6. **Kein Request:** ein Test mit einem werfenden `fetch`-Spy belegt, dass keine Funktion in
   `dashboard.js` ihn aufruft.
7. Job-Historie: nach sechs Jobs sind **5** Einträge vorhanden, der älteste ist weg,
   der neueste steht vorn.

**Manuell** (in `docs/MANUAL-TEST.md`): **direkt nach dem Verbinden** auf Dashboard gehen und
prüfen, dass nicht lauter Nullen stehen; Kacheln gegen die echte Instanz plausibilisieren;
dein Admin-Account muss unter „unbegrenzt" erscheinen und **nicht** als „fast voll";
„Neu laden"; nach einem Batch-Job erscheint er in der Job-Historie; nach Neustart ist sie leer.

## Ausdrücklich NICHT
- **Keine Persistenz** der Job-Historie, keine Datei, kein Schema.
- Keine Zusatz-Requests für die Kacheln — alles aus der geladenen Liste.
- Keine Gesamtsumme „genutzt vs. Kontingent" als eine Zahl.
- Kein `relative` aus der API verwenden (zeigt bei unbegrenzt `0`).
- Keine neuen Abhängigkeiten.
