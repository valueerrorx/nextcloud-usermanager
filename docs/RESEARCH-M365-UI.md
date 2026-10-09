# Research: UX-Muster des Microsoft365-Managers (für S16/S17)

Stand 2026-10-09. Referenz (read-only): `/home/valueerror/Nextcloud/WebDEV/Microsoft365-Manager`.
Pfade unten relativ dazu. Coder dürfen die Dateien **lesen**, nie ändern.

## 1. Start und Verbindung
- App startet immer im Dashboard (`src/router/index.js:17`). `src/App.vue:147-155` prüft beim Start
  den Verbindungsstatus; bis dahin ersetzt „Session wird geprüft…" (`bi-hourglass-split`, `#8b949e`)
  den Inhalt (`App.vue:9-12`).
- **Kein Login-Popup** in der Vorlage. Nächstes Muster ist das Device-Code-Overlay `App.vue:18-35`,
  CSS `App.vue:158-208`: `.device-login-overlay` (fixed, inset 0, z-index 2000,
  `rgba(1,4,9,.82)`, flex-zentriert), `.device-login-card` (`min(480px,100%)`, padding
  `1.75rem 1.5rem`, Radius 12px, Border `#30363d`, Hintergrund `#161b22`,
  Schatten `0 16px 48px rgba(0,0,0,.45)`).

## 2. Sidebar-Fuß (`src/components/AppSidebar.vue:84-134`, CSS dort 305-455 und `src/assets/main.css`)
- Status: `.conn-dot` 8x8px rund; `.connected` grün mit `box-shadow 0 0 6px var(--success)`;
  `.disconnected` `var(--text-secondary)`; `.connecting` `var(--warning)` pulsierend
  (`main.css:582-592`). Daneben Domain bzw. „Nicht verbunden" (.78rem, sekundär).
- Darunter „Zuletzt: <Zeit>" (.7rem).
- Logout `.sidebar-logout-btn`: flex, gap .45rem, volle Breite, padding .4rem .55rem, Radius 6px,
  .78rem, Border `rgba(248,81,73,.35)`, Hintergrund `rgba(248,81,73,.08)`, Farbe `#f85149`;
  Hover `rgba(248,81,73,.16)` / `.55` / `#ff7b72`. Icon `bi-box-arrow-left`, Text „Abmelden".
- **Logout löscht den gespeicherten Zugang** und setzt die Stores zurück, dann Toast.
- Versionsknopf `.sidebar-version-btn`: Block, volle Breite, linksbündig, .68rem, `#6e7681`,
  Hover `#8b949e`. Text `v<version>`.

## 3. About-/Copyleft-Karte (`AppSidebar.vue:194-214`, CSS 419-454)
Bootstrap-Markup-Modal `.modal.d-block.about-modal-backdrop` (`rgba(0,0,0,.6)`), `modal-sm`,
`.about-modal-content` (`#21262d`, Border `var(--sidebar-border)`). Inhalt zentriert:
gespiegeltes „©" (`font-size 3.25rem; transform: scaleX(-1)`), „2026" (klein, sekundär),
App-Name (1.05rem, semibold), „Version x.y.z" (.82rem, sekundär), „Thomas Michael Weissel"
(1.08rem), Link-Button „https://xapient.solutions/". Kein Header, kein Footer, kein Schließknopf —
schließt per Klick auf den Hintergrund. Version aus `package.json`. **Kein GPL-Text.**

## 4. Dashboard (`src/views/DashboardView.vue`)
- `.page-header` mit `h1.page-title` (1.25rem/700) und `p.page-subtitle` (.83rem, sekundär).
- Kacheln: `row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3 mb-4`; je
  `.stat-card.stat-card-rich` mit `.stat-icon` (40x40, Radius 8px, 1.2rem), Akzent **inline**
  (Hintergrund Akzent mit .12 Alpha, Vordergrund Akzent), dann `.stat-card-kicker`,
  `.stat-value.stat-value-lg`, `.stat-label`, `.stat-card-metrics.stat-card-metrics--stack` mit
  `.stat-metric--row`.
- Akzente der Vorlage: Benutzer `bi-people-fill` `#58a6ff`; Gruppen `bi-collection-fill`
  `#a371f7`; gelb `#d29922`; türkis `#56d4dd`.
- Untere Reihe: `.content-card` „Schnellzugriff" mit „Daten aktualisieren" (`bi-arrow-repeat`,
  dreht beim Laden) und Link-Zeilen (Icon-Kachel 36x36, Radius 8, getönte Zeile, rechts
  `bi-box-arrow-up-right`).
- Wenn nicht verbunden: Info-Banner `.alert-dark-info` mit `bi-info-circle-fill` und Button
  „Verbinden" (`bi-plug`).

## 5. Benutzerliste (`src/views/UsersView.vue`)
- Header mit Titel, Untertitel „n Benutzer", rechts „Aktualisieren" (`bi-arrow-clockwise`, `.spin`).
- **Filter in einer Zeile** (21-69): `content-card mb-3` > `content-card-body py-2` >
  `row g-2 align-items-center`; Suche `col-md-5` als `input-group input-group-sm` mit
  `bi-search` und x-Button; Selects `col-auto` `form-select-sm` (min-width 130px);
  rechts `col-auto ms-auto` Trefferzahl und „CSV Export".
- **Aktionen je Zeile** (224-246): `d-flex gap-1 flex-nowrap` aus `.btn-action`-Buttons mit
  `title`: Bearbeiten `bi-pencil`, Passwort `bi-key`, Aktivieren/Deaktivieren
  `bi-person-check`/`bi-person-slash` (`.danger` wenn aktiv), Löschen `bi-trash` `.danger`.
  `.btn-action` (`main.css:600-633`): padding .2rem .45rem, .78rem, Radius 4px, Border `#30363d`,
  transparent; Hover Akzent-Tönung; `.danger`/`.warning` färben nur beim Hover;
  `:disabled` Opacity .35.
- Name-Spalte mit Avatar `.user-avatar` (Initialen, 30px rund, Gradient `#58a6ff` -> `#1f6feb`).
- **Batch-Leiste** (72-115): erscheint **über der Tabelle ab 2 Ausgewählten**, als
  `content-card mb-2` > `content-card-body py-2 px-3 d-flex flex-wrap align-items-center gap-2`:
  „**n** ausgewählt", dann `btn btn-outline-* btn-sm` mit Icon (Zur Gruppe hinzufügen
  `bi-people`, Deaktivieren outline-danger `bi-person-slash`, Aktivieren outline-success
  `bi-person-check`, Löschen outline-danger `bi-trash` …), rechts
  `btn btn-link btn-sm text-secondary ms-auto` „Auswahl aufheben".
- Kopf-Checkbox mit `:indeterminate.prop`, wählt **alle gefilterten**.
- Ergebnis als Toast („Löschen (Batch): 5 OK, 1 fehlgeschlagen").

## 6. Toasts (`App.vue:37-53`, `main.css:692-718`)
Unten rechts, 4 s, 3px farbige linke Kante, Icons `bi-check-circle-fill` / `bi-exclamation-circle-fill`
/ `bi-info-circle-fill`. Hier umgesetzt als swal2 `toast: true`, `position: 'bottom-end'`.
