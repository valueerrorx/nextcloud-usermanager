# S14 + S15 — Nachtrag: Einzel-User anlegen und CSV-Usernamenliste

Status: spec (schlanker Modus — ein Review für beide)
Bindend: `CLAUDE.md`, `docs/GOAL.md` §2 und §5, `docs/ARCHITECTURE.md` §3, §5, §6.2,
`docs/DECISIONS.md`, `docs/REVIEW-NOTES.md` (60 Einträge).

## Warum es diese Schritte gibt

Der Abschluss-Review hat zwei GOAL-Funktionen gefunden, die **keinen Plan-Schritt** hatten und
still fehlend ausgeliefert worden wären. Erkennbar waren sie an **toten Exporten**:
`validateUserid(s, { quelle: 'manuell' })` und `parseUserList` hatten null Aufrufer, dazu zwei
unbenutzte Fixtures und ein unerreichbares `zweck: 'userliste'`.

**Beide Schritte verdrahten bestehende, getestete Module. Es entsteht keine neue Fachlogik.**

---

# S14 — Einzel-User anlegen (GOAL §2)

## Umsetzung
Formular in `UsersView.vue` (Karte „Benutzer anlegen", über die Tabelle einklappbar),
Button mit `bi-person-plus`.

Felder: **Benutzername** (Pflicht), **Anzeigename**, **E-Mail**, **Passwort** (Pflicht),
**Kontingent** aus `QUOTA_PRESETS`, **Gruppen** aus der geladenen Gruppenliste (Mehrfachauswahl).

- **Der Benutzername läuft durch `validateUserid(wert, { quelle: 'manuell' })`** — live bei
  jeder Eingabe, Fehlertext darunter. Das ist der bisher einzige Aufrufer dieses Pfads und der
  Grund, warum DECISIONS „Zeichensatz für manuell eingegebene `userid`" existiert:
  erlaubt sind `[A-Za-z0-9_.@-]`, damit `max_mueller` möglich ist.
- **Anlegen über die bestehende Pipeline**: `actions.run` mit `action: 'user.create'` und
  **einem** Item. Kein zweiter Ausführungspfad, kein direkter OCS-Aufruf aus dem View.
  Die `params`-Form ist die aus S11 (`byUserid`-Map plus `groups`/`quota`).
- Nach Erfolg: Formular leeren, **Userliste neu laden** über `loaders.js`.
- Fehler erscheinen als deutscher Text am Formular, nicht als swal2-Popup.
  `102` -> „Benutzer existiert bereits", `107` -> Passwort-Policy, `111` -> `userid_nicht_erzeugbar`.
- Ein Teilfehler bei den Gruppen ergibt `teilweise` — der Hinweis nennt die Gruppe.

## Abnahme S14 (automatisiert)
1. `validateUserid` mit `quelle: 'manuell'` ist **verdrahtet**: ein Test belegt, dass
   `UsersView.vue` die Funktion mit genau diesem `quelle`-Wert aufruft.
   (Verdrahtungsprüfung per Quelltext-Scan ist hier legitim — das Fehlen der Verdrahtung *war*
   der Bug, REVIEW-NOTES `[S11]`.)
2. `buildCreateUserItems` bzw. die S14-Variante erzeugt für ein Einzelformular genau **ein**
   Item mit den richtigen `params`.
3. Kein neuer OCS-Aufruf: `src/main/ocs/users.js` bleibt **unverändert**.

---

# S15 — CSV-Usernamenliste als Batch-Eingabe (GOAL §5)

## Umsetzung
Button in `UsersView.vue` neben den Filtern: „Auswahl aus CSV" (`bi-upload`).

1. `files.openCsv` mit **`zweck: 'userliste'`** (bisher unerreichbar).
2. `parseUserList(text)` (bisher null Aufrufer, null Tests) liefert die Usernamen.
3. Die gelesenen Usernamen werden die **Auswahl** (`state.auswahl`).
4. **Unbekannte Usernamen landen über die bestehende Mechanik in `ausgeschlossen`**:
   `planActions` setzt für eine `userid`, die nicht in `users` ist, bereits
   `grund: 'nicht_gefunden'` (S10-Fix). **Hier ist nichts neu zu bauen** — der Dry-Run zeigt sie
   im Block „ausgeschlossen", und `anzahl` zählt sie nicht mit.
5. Nach dem Einlesen eine Rückmeldung: „n Usernamen gelesen, davon m in der Liste gefunden".
   Die Zahl der Nicht-Gefundenen kommt aus einer **puren Funktion**, nicht aus dem Template.
6. **Die Auswahl darf nur Usernamen enthalten, die geladen sind** — `pruneAuswahl` aus S06
   läuft wie bei jedem Filterwechsel. Unbekannte bleiben also nicht als Geister in der Auswahl,
   sie erscheinen in der Rückmeldung.

**Die Userliste muss geladen sein**, bevor die Auswahl gesetzt wird — sonst ist jeder Username
„nicht gefunden". Gleiche Regel wie in S10, S12 und S13: über `loaders.js` laden und bis dahin
den Button deaktivieren.

## Abnahme S15 (automatisiert)
1. **`parseUserList` bekommt Tests** (hatte null): mit Header `Username`, ohne Header,
   Leerzeilen, Whitespace, CRLF, BOM. Die Fixtures `userliste-mit-header.csv` und
   `userliste-ohne-header.csv` werden **benutzt**.
2. Eine pure Funktion liefert `{ gefunden, nichtGefunden }` für eine Liste von Usernamen gegen
   die geladene Userliste. Vergleich **exakt** — nicht case-insensitiv
   (REVIEW-NOTES `[S08]`: Case-Insensitivität nur beim Selbstschutz, nie bei der Zuordnung
   Auswahl -> Datensatz, weil `Aaron.w` und `aaron.w` getrennte Konten sein können).
   **Pflichttest mit genau diesem Paar.**
3. `files.openCsv` wird mit `zweck: 'userliste'` aufgerufen (Verdrahtungstest).
4. Ein Test belegt, dass `parseUserList` jetzt **einen Aufrufer** hat.

---

## Gemeinsame Regeln
- **Keine Berechnung in `.vue`-Dateien** (`[S06]`, sechsmal verletzt): kein `Set`, `sort`,
  `filter`, `reduce`, `map`, `localeCompare`. Alles Abgeleitete nach `src/shared/` **mit Test**.
- **Kein zweiter Ausführungspfad** — `actions.run` und `loaders.js` werden benutzt.
- Icon-Buttons brauchen `title` **und** `aria-label`; Formularfelder `<label for>` + `id`.
- Keine neuen Abhängigkeiten. Keine Änderung an `src/main/ocs/`.
- **Manuell** in `docs/MANUAL-TEST.md`: #40-42 (Einzel-User anlegen, inkl. ungültiger
  Benutzername und `max_mueller` als gültiger) und #71 (CSV-Usernamenliste, mit einer Datei,
  die zwei unbekannte Namen enthält) werden damit **ausführbar** — bisher waren sie es nicht.
