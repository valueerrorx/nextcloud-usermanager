# S06 — Suche, Filter, Sortierung, Mehrfachauswahl

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §4.1, `docs/REVIEW-NOTES.md` (27 Einträge).

## Ziel

Die Usertabelle wird durchsuchbar, filterbar, sortierbar und mehrfach auswählbar.
Alles clientseitig auf der schon geladenen Liste — **kein** zusätzlicher Request.

## A. `src/shared/filters.js` (pur)

```js
quotaStufe(q: QuotaInfo) -> 'unter50'|'f50bis90'|'ueber90'|'unbegrenzt'|'unbekannt'
matchesSuche(u: UserView, q: string) -> boolean
sortUsers(users, { feld, richtung }) -> UserView[]      // neue Liste, nicht in-place
filterUsers(users, { suche, gruppe, status, quotaStufe }) -> UserView[]
```

**`quotaStufe`** (ARCHITECTURE §4.1, verbindlich):
`limited` mit `usagePercent < 50` -> `unter50`; `>= 50 && <= 90` -> `f50bis90`;
`> 90` -> `ueber90`; `unlimited` -> `unbegrenzt`; alles andere -> `unbekannt`.
**Grenzwerte als Pflichttest: genau 50, genau 90, 90,1.** 50 gehört zu `f50bis90`,
90 gehört zu `f50bis90`, 90,1 zu `ueber90`.

**`matchesSuche`**: case-insensitiver Teilstring über `userid`, `displayname`, `email`.
Leerer oder getrimmt leerer Query -> `true`. `email === null` darf nicht werfen.

**`sortUsers`**: Felder `userid`, `displayname`, `quota`. Strings über
`localeCompare('de')` — Pflichttest mit Umlauten: `Ärzte` sortiert vor `Bauer`, nicht danach.
Sortierung nach `quota` ordnet nach `usagePercent`; `unbegrenzt` und `unbekannt` landen
**immer am Ende**, unabhängig von der Richtung (sonst wandern sie bei „absteigend" nach vorn
und verdecken die interessanten Fälle). Stabil bei Gleichstand.

**`filterUsers`**: alle Kriterien sind **UND**-verknüpft. `gruppe: null` = alle;
`status: 'alle'|'aktiv'|'deaktiviert'`; `quotaStufe: null` = alle.
Gibt immer eine **neue** Liste zurück.

## B. Renderer

- `UserTable.vue`: Spaltenköpfe für `userid`, `displayname`, `quota` sind klickbar und schalten
  die Richtung um; die aktive Spalte ist sichtbar markiert. Checkbox je Zeile plus eine
  „alles auswählen"-Checkbox im Kopf.
- **„Alles auswählen" trifft genau das aktuelle Filterergebnis**, nicht die ganze Liste
  (DECISIONS). Daneben steht die Anzahl. **Diese Zahl ist tragend** — sie ist später die Zahl,
  die beim Batch-Löschen eingetippt werden muss.
- Ändert sich der Filter, bleiben nur noch die Auswahl-Einträge erhalten, die im neuen
  Filterergebnis **enthalten** sind. Eine Auswahl darf keine unsichtbaren User mitschleppen.
- Die Auswahl hält **`userid`-Strings**, keine Objektreferenzen — nach „Neu laden" sind die
  Objekte neu und Referenzen wären tot.
- `UsersView.vue`: Suchfeld, Gruppen-Dropdown (aus `UserView.groups` abgeleitet, alphabetisch),
  Status-Dropdown, Quota-Stufen-Dropdown mit den fünf Stufen, „Filter zurücksetzen".
  Zeigt „X von Y Benutzern" und die Anzahl der Auswahl.
- `state.js`: `filterSuche`, `filterGruppe`, `filterStatus`, `filterQuotaStufe`,
  `sortFeld`, `sortRichtung`, `auswahl` (Set oder Array von `userid`).
- Die gefilterte und sortierte Liste ist ein **`computed`**, das `filterUsers` und `sortUsers`
  aufruft. **Keine Filter- oder Sortierlogik in der Komponente** (ARCHITECTURE §4.1).

## Abnahmekriterien

**Automatisiert (~25 Tests):**
1. `quotaStufe` an den Grenzwerten **50, 90, 90,1** plus `unlimited` und `unknown`.
2. `matchesSuche`: Treffer in `userid`, in `displayname`, in `email`; case-insensitiv;
   leerer Query -> `true`; `email: null` wirft nicht.
3. `sortUsers`: Umlaut-Test (`Ärzte` vor `Bauer`); beide Richtungen; `unbegrenzt`/`unbekannt`
   bei Quota-Sortierung **in beiden Richtungen am Ende**; Eingabeliste bleibt unverändert.
4. `filterUsers`: jedes Kriterium einzeln; zwei Kriterien kombiniert (UND); alle `null`/`'alle'`
   -> unveränderte Menge; Rückgabe ist eine neue Liste.
5. **Auswahl-Schnitt:** eine Hilfsfunktion `pruneAuswahl(auswahl, gefilterte) -> string[]`
   in `filters.js` entfernt alle `userid`s, die nicht im Filterergebnis sind. Test: Auswahl aus
   3 Usern, Filter zeigt nur noch 1 davon -> Auswahl hat genau diesen einen.

**Manuell** (in `docs/MANUAL-TEST.md`): Suche, jedes Dropdown, Spaltensortierung,
„alles auswählen" mit aktivem Filter, Zähler stimmt, Filter zurücksetzen.

## Ausdrücklich NICHT
- Keine Aktionen, keine Aktionsleiste, kein Dry-Run, kein Batch, kein Löschen (S07/S08).
- Kein Dashboard, keine Gruppenverwaltung, kein CSV, kein Setzen von Kontingenten.
- Keine serverseitige Suche, keine Paginierung (unter 5000 User laut DECISIONS).
- Keine neuen Abhängigkeiten.
