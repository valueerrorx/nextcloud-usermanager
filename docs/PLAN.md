# Plan

Quelle der Wahrheit für den Fortschritt. Nach jedem Schritt aktualisiert.
Architektur: `docs/ARCHITECTURE.md`. Entscheidungen: `docs/DECISIONS.md`. Fallen: `docs/REVIEW-NOTES.md`.

Jeder Schritt ist vertikal, lauffähig und testbar, Ziel unter ~300 geänderte Zeilen.
Reihenfolge ist Absicht: S02 steht vor dem Netzwerkcode, weil der Username-Generator die
größte Korrektheitsverpflichtung des Ziels ist und vollständig spezifiziert vorliegt.

## Schritte

- [x] S01 Lauffähiges Skelett | acceptance: `npm run dev` öffnet ein dunkles Fenster, 5 Views navigierbar; `npm test` + `npm run lint` grün; `npm run build` erzeugt ein startbares Linux-Artefakt; `mainWindow.test.js` beweist `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` | status: **done** (41 Tests, Lint über 20 Dateien inkl. 6 .vue, Abnahme 1-4 + 7a/7b am 2026-10-06 vom Nutzer manuell bestätigt: App startet, Sidebar und alle 5 Views funktionieren)
- [x] S02 Username-Generator (pur) | acceptance: alle 14 Zeilen aus RESEARCH-UPN §11 und alle 5 Fixtures aus §10 grün inkl. der zwei `''`-Fehlerfälle; `truncateToFit` reihenfolgeunabhängig; `validateUserid` für beide Zeichensätze; Modul importiert nichts mit I/O | status: **done** (237 Tests; Port vom Reviewer codepoint-weise als byte-identisch zum Referenzprojekt bestätigt; Idempotenz über 200k Zufallseingaben; drei Mutationen verifiziert getötet)
- [x] S03 OCS-Client (gemockt) | acceptance: `OCS-APIRequest`-Header auf jedem Request erzwungen (Mutationsbeweis); Envelope-Unwrap verlangt HTTP 2xx **und** `statuscode === 100`; die v2-Falle (`statuscode: 200`) gilt als Fehler; vollständige Klassifikationstabelle 401/403/429/HTML/302/204/Timeout/Zertifikat/Netz mit je erwarteter `kind` und `messageId`; Retry 429 (2x) und 5xx nur für GET (1x), `versuche <= 3`; App-Passwort in keinem Result und keiner Meldung | status: **done** (291 Tests; zwei echte Bugs gefunden und behoben: `??` statt Disjunktion bei der Timeout-Ursache, und `notOcs` vor 5xx machte den 5xx-Retry unerreichbar)
- [x] S03a URL-Normalisierung (pur) | acceptance: `normalizeBaseUrl` gegen die volle Erwartungstabelle inkl. Subpath, Port, IP, `/ocs/...`-Mitte, `HTTPS://`, `http` abgelehnt, URL mit Zugangsdaten abgelehnt; Modul ohne I/O | status: **done**
- [x] S04 Verbindungsdialog + Credentials | acceptance: `connect` testet und füllt die Session nur bei Erfolg; falsches Passwort, Nicht-Admin, 429 und HTML-Antwort liefern je eine eigene deutsche Meldung; bei `basic_text` wird nichts persistiert und gewarnt; App-Passwort erscheint in keinem IPC-Rückgabewert | status: **done** (373 Tests; zwei kritische Befunde behoben: Zertifikatsausnahme erreichte `session` nicht, und der Stack-Wechsel auf `net.fetch` hatte die Zertifikats-Klassifikation entwertet)
- [x] S05 Userliste lesen | acceptance: `users/details`-Probe mit erzwungenem 404 fällt auf N+1 zurück und liefert identische Identitätsfelder; `parseQuota` deckt alle sechs Shapes; Tabelle mit Loading/Empty/Error | status: **done** (439 Tests; kritischer Fund: jeder Probe-Fehler loeste den N+1-Fallback aus und memoisierte ihn — ein 429 haette einen Request-Sturm verursacht. Zweiter Fund: die Prozentformel war ungeprueft, ohne `* 100` haette die >90%-Liste nie ausgeloest)
- [x] S06 Tabelle: Suche, Filter, Auswahl | acceptance: Suchprädikat über userid/displayname/email; fünf Quota-Stufen; Sortierung mit `localeCompare('de')`; „alles auswählen" trifft genau das Filterergebnis und die angezeigte Zahl stimmt | status: **done** (480 Tests; zwei kritische Befunde: abgeleitete Gruppenliste wurde in der Vue-Komponente berechnet, und das tragende Auswahl-Prädikat existierte doppelt)
- [x] S07 Batch-Kern (pur + gemockt) | acceptance: `pool` hält Parallelität 4; 50 Items mit 7 Fehlern, einem 429 und Abbruch bei Item 20 verbuchen jedes Item genau einmal; 429 nach erschöpften Retries ist `server_blockt_vorerst`, kein Jobabbruch; `teilweise` bei fehlgeschlagenem Gruppenschritt; `session.test.js` deckt Stop-Flag und `actions.stop`-Zustände | status: **done** (519 Tests; zwei echte Defekte: Fortschritt feuerte gebündelt erst nach Jobende, und eine unbekannte Action-ID machte `actions.run` rejectend)
- [x] S08 Aktionen + Bestätigungen (UI) | acceptance: Dry-Run lokal ohne Re-Fetch, No-Ops als „keine Änderung" ausgeschlossen; Löschen verlangt die Dry-Run-Zahl und nennt die Dateilöschung; Selbstschutz schließt den verbundenen Admin sichtbar aus; Ergebnis-CSV mit den sechs Spalten | status: **done** (571 Tests; kritisch: `saveCsv` konnte über die IPC-Grenze rejecten und zwei Renderer-Aufrufe hatten kein `catch`. Datenrisiko behoben: die Auswahl-Zuordnung war case-insensitiv und hätte beim Löschen den falschen Account treffen können)
- [x] S09 CSV-Import: Parsen + Plan (pur) | acceptance: je eine Fixture pro Datei- und Zeilenfehler landet im erwarteten Status; die vier Fälle aus §6.1 grün; Re-Import derselben Datei ergibt für jede angelegte Zeile `benutzer_existiert_bereits` | status: **done** (670 Tests, 20 Fixtures)
- [x] S09a UI-Designsystem | acceptance: Bootstrap 5 (nur CSS) + bootstrap-icons eingebunden; Primer-Palette als CSS-Variablen; portierte Komponentenschicht (Karten, Tabelle mit Sticky-Header, Badges, Icon-Buttons, Toasts); swal2 dunkel gestylt; alle bestehenden Views umgestellt **ohne Logikänderung**; `npm test`/`lint`/`build` grün | status: **done** (683 Tests; kritisch: CSP blockierte Bootstraps `data:`-SVGs, alle Dropdowns waren ohne Indikator — und drei Formularfelder inkl. App-Passwort hatten nach dem Umbau keinen zugänglichen Namen)
- [ ] S10 Importvorschau (UI) | acceptance: Vorschautabelle zeigt Zeile, Name, Geburtsdatum, Username, Status und bei Fehler den deutschen Text; Prefix-Validierung mit Live-Beispiel; Zielgruppen nur aus Serverliste plus „Gruppe neu anlegen" | status: todo
- [ ] S11 Import ausführen + Export | acceptance: ein `POST` pro User plus Gruppenschritte; Teilfehler in Zeile 3 lässt die übrigen Zeilen angelegt; Export enthält Username und Initialpasswort plus die in der Vorschau abgewiesenen Zeilen; swal2-Warnung vor dem Speichern | status: todo
- [ ] S12 Gruppenverwaltung | acceptance: anlegen, löschen mit Bestätigung samt Mitgliederzahl, Mitgliederliste aus der geladenen Userliste abgeleitet, `admin`-Gruppe geschützt, Codes 101/102/103 auf deutsche Meldungen | status: todo
- [ ] S13 Dashboard | acceptance: alle Kacheln aus der geladenen Liste ohne Zusatz-Requests; vier Speicherwerte korrekt bei einem unbegrenzten, einem unbekannten und einem 95-%-User; `>90 %`-Liste sortiert und bei 20 gekappt; Job-Historie der Sitzung mit kohärentem `teilweise` | status: todo

## Hinweise zur Umsetzung

- **Elektron-Version:** `>= 28` ist die Untergrenze (ESM im Main-Prozess). Der Coder pinnt in S01
  die aktuelle stabile Major-Version exakt und trägt sie hier ein: `44.5.1`
- **S01 versteckte Abhängigkeiten** (vom Gate benannt, nicht übersehen): ESM-Main hat kein
  `__dirname` — Preload-Pfad und `dist/renderer/index.html` über `import.meta.url` auflösen;
  `base: './'` in `vite.config.js`, sonst bleibt das gepackte Fenster weiß; von SweetAlert2 wird
  in S01 nur das CSS importiert (ein unbenutzter Modulimport bricht `npm run lint`);
  `mainWindow.test.js` importiert `src/main/windowOptions.js` **direkt, ohne `electron`-Mock**,
  und muss einen absoluten Preload-Pfad tolerieren.
- **Preload ist CommonJS** (`src/preload/index.cjs`), weil `sandbox: true` keine ESM-Preloads
  erlaubt. Rest ESM mit `"type": "module"` plus ESLint-Override für diese eine Datei.
- Die Schrittliste in `docs/SPEC-CRITIQUE.md` ist **veraltet** (nennt `groups.members` und ein
  einschrittiges `user.create`). Diese Datei hier ist maßgeblich.

## Offene Verifikation (blockiert S01-S02 nicht)

Vier API-Fakten sind unverifiziert; der Entwurf ist darauf defensiv ausgelegt. Klärung über
`docs/nc-verify.sh` gegen `https://cloud.xapient.solutions`
(Aufruf: `bash docs/nc-verify.sh <admin-user>`; Passwort wird interaktiv gelesen):
- `users/details`: v1- oder v2-Pfad, echte Response-Form
- Quota-Form beim Einzeluser (Skalar vs. Objekt)
- echte `MAX_USERID_LENGTH` (defensiv 64)
- Gruppenmitglieder-Form — **entschärft**, weil `groups.members` aus dem Entwurf entfernt wurde

## Später (nicht im Scope, bewusst verschoben)

- Batch-Aktion „Einstellungen ändern" (E-Mail-Domain, Anzeigename-Format) — gestrichen
- Persistente Batch-Job-Historie über Sitzungen hinweg
- Mehrere gespeicherte Server-Profile (schon in GOAL als Nicht-Ziel)
- Gruppen-Anzeigename ändern, Subadmin-Verwaltung
- Rollback für teilweise angewandte Importe
- Paginierung und serverseitige Suche (erst ab deutlich über 5000 Usern nötig)
