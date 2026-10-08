# S09a — UI-Designsystem

Status: spec (schlanker Modus — ein Review)
Bindend: `CLAUDE.md`, `docs/DECISIONS.md` (die vier UI-Zeilen vom 2026-10-08),
`docs/REVIEW-NOTES.md`.

## Ziel

Die App bekommt das Aussehen des Referenzprojekts `Microsoft365-Manager`.
**Reiner Umbau der Darstellung — keine Logikänderung, keine neue Funktion.**
Alle 670 Tests müssen unverändert grün bleiben.

Dieser Schritt kommt **vor** S10, damit Importvorschau, Gruppen und Dashboard direkt im
Zielzustand entstehen.

## Vorlage, als Fakten

Du darfst `/home/valueerror/Nextcloud/WebDEV/Microsoft365-Manager` **lesen** (read-only,
per Projektkonfiguration erlaubt), insbesondere `src/assets/main.css`, `src/App.vue`,
`src/views/UsersView.vue`, `src/views/DashboardView.vue`, `index.html`.
**Nichts dort ändern.** Der Autor ist derselbe, die Übernahme ist lizenzrechtlich geklärt.

### Palette (CSS-Variablen, verbindlich)
```
--body-bg #0d1117   --sidebar-bg #161b22   --card-bg #161b22
--sidebar-border #30363d
--text-primary #e6edf3   --text-secondary #8b949e
--accent #58a6ff   --success #3fb950   --danger #f85149   --warning #d29922
```
Zusätzliche Akzente aus der Vorlage: `#484f58` (Placeholder/disabled), `#21262d`,
`#1f6feb` (Avatar-Gradient), `#f0883e`, `#b87fff`.
Radien: **6px** Buttons/Nav, **8px** Karten, **20px** Pill-Badges, **4px** kleine Chips.
Schatten sparsam: `0 0 0 1px rgba(88,166,255,0.15)` Hover auf Karten,
`0 4px 12px rgba(0,0,0,0.4)` Toasts.
**System-Font-Stack, keine Webfont.** Monospace nur für technische Werte
(`ui-monospace, 'Cascadia Code', Consolas, monospace`).

### Abhängigkeiten (genehmigt)
- `bootstrap` — **nur das CSS** (`bootstrap/dist/css/bootstrap.min.css`).
  **Kein** Bootstrap-JS importieren: wir brauchen keine JS-Komponenten, Dialoge laufen über swal2.
- `bootstrap-icons` — `bootstrap-icons/font/bootstrap-icons.css`, Nutzung als `<i class="bi bi-…">`.
- `<html data-bs-theme="dark">` in `index.html` setzen.
- **Keine weiteren** Abhängigkeiten.

## Umzubauen

### Komponentenschicht in `src/renderer/styles/theme.css`
Portiere aus `main.css` der Vorlage, angepasst an unsere Struktur:
`.content-card` / `-header` / `-body`, `.stat-card` / `.stat-icon`,
Tabelle mit **Sticky-Header** (`position: sticky; top: 0`), Hover-Tint
`rgba(88,166,255,0.04)`, **kein** Zebra-Streifen, Kopfzeile uppercase und gedämpft,
`.badge-active` / `.badge-inactive` (Pill) und kleine Chips für Gruppennamen,
`.btn-action` (Icon-Buttons in Tabellenzeilen, inkl. `.danger`-Hover und disabled),
Formular-Overrides (dunkles `#0d1117`, Fokusring `0 0 0 0.2rem rgba(88,166,255,0.15)`),
Scrollbar-Styling, `.conn-dot` (farbiger Punkt für den Verbindungsstatus),
Toast-Stack unten rechts mit 3px farbiger linker Kante.

### swal2 dunkel
Per CSS-Variablen an die Palette angleichen (Hintergrund `--card-bg`, Text `--text-primary`,
Buttons in `--accent` bzw. `--danger`). **Die S08-Logik bleibt unberührt** — insbesondere die
Löschbestätigung mit Zahleneingabe.

### Icons je Aktion (aus der Vorlage übernommen)
| Zweck | Klasse |
|---|---|
| Aktivieren | `bi-person-check` |
| Deaktivieren | `bi-person-slash` |
| Löschen | `bi-trash` |
| Passwort setzen | `bi-key` |
| Kontingent setzen | `bi-hdd` |
| Zu Gruppe hinzufügen | `bi-people` |
| Aus Gruppe entfernen | `bi-person-dash` |
| Bearbeiten | `bi-pencil` |
| Neu laden | `bi-arrow-clockwise` (mit `.spin` während des Ladens) |
| Suche | `bi-search` |
| Filter | `bi-funnel` |
| Import | `bi-upload` |
| CSV-Export | `bi-download` |
| Verbinden / Status | `bi-plug` |
| Abbrechen / Schließen | `bi-x-lg` |
| Bestätigen | `bi-check-lg` |
| Warnung | `bi-exclamation-triangle` |
| Info | `bi-info-circle` |
| Sortierung auf/ab | `bi-caret-up-fill` / `bi-caret-down-fill` |
| Dashboard | `bi-speedometer2` |
| Benutzer | `bi-people-fill` |
| Gruppen | `bi-collection-fill` |

### Views
`App.vue` (Sidebar mit Icons, Zertifikats-Banner), `ConnectView.vue`, `UsersView.vue`,
`UserTable.vue`, `QuotaCell.vue`, `StateBlock.vue`, `ActionBar.vue`, `JobProgress.vue`.
Die vier noch leeren Views bekommen nur den Kartenrahmen, keinen Inhalt.

**Empty-States** wie in der Vorlage: zentriertes großes Icon in `#30363d`, darunter gedämpfter
Text, optional ein Button.

**Icon-Buttons brauchen ein `title`** und, wenn ohne Textlabel, ein `aria-label` — sonst ist
nicht erkennbar, was sie tun.

## Harte Grenzen

- **Keine Logikänderung.** Kein `computed` umbauen, keine Funktion aus `src/shared/` oder
  `src/main/` anfassen, keine IPC-Kanäle, keine Zustandsfelder umbenennen.
- **Keine Berechnung in `.vue`-Dateien** (REVIEW-NOTES `[S06]`): kein `Set`, `sort`, `filter`,
  `reduce`, `localeCompare`. Brauchst du einen abgeleiteten Wert, gehört er als benannte pure
  Funktion nach `src/shared/` **mit Test**.
- **Kein Bootstrap-JS**, keine weiteren Pakete.
- Dark only, kein Light-Pfad, kein Theme-Schalter.
- Deutsche UI-Texte, englische Identifier und Kommentare.

## Abnahmekriterien

1. `npm test` grün — **alle 670 bestehenden Tests unverändert**. Schlägt einer fehl, hast du
   Logik angefasst.
2. `npm run lint` grün, inklusive aller `.vue`-Dateien.
3. `npx vite build` grün; das gebaute `index.html` enthält weiter die CSP und nur **relative**
   Asset-Pfade.
4. `tests/theme.test.js` prüft derzeit die **exakte** Menge von sechs Tokens. Das ist die
   bekannte Allowlist-Falle (REVIEW-NOTES `[S01]`) und wird mit dieser Palette planmäßig rot.
   **Umdrehen:** prüfen, dass die benötigten Variablen **vorhanden** sind und die Pflichtwerte
   stimmen — keine Obergrenze für die Anzahl.
5. Ein Test belegt, dass `bootstrap-icons` und `bootstrap` in `package.json` stehen und dass
   **kein** Bootstrap-JS importiert wird (Prüfung auf den Import in `main.js`).
6. `mainWindow.test.js` bleibt grün: `backgroundColor` muss auf den neuen `--body-bg`-Wert
   `#0d1117` angepasst werden, und der Test zieht mit.

**Manuell** (in `docs/MANUAL-TEST.md`): Sidebar mit Icons, Verbindungsansicht, Usertabelle mit
Sticky-Header und Icon-Buttons, Aktionsleiste, Fortschritt, ein swal2-Dialog in Dunkel,
Empty-State, und dass nichts funktional anders reagiert als vorher.

## Ausdrücklich NICHT
- Keine neuen Funktionen, keine Importvorschau, keine Gruppenverwaltung, kein Dashboard-Inhalt.
- Kein Light Theme, kein Theme-Schalter, keine Mehrsprachigkeit.
- Keine Toast-Bibliothek — falls Toasts gebraucht werden, das einfache Array-plus-Timeout-Muster
  der Vorlage, aber **nur** wenn ein bestehender View sie schon braucht.
- Keine Änderung an `src/main/`, `src/shared/` (Ausnahme: eine neu extrahierte pure Funktion
  samt Test, falls unvermeidbar).
