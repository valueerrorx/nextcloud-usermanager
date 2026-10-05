# S01 — Lauffähiges Skelett

Status: approved (nach einer Revisionsrunde)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §1, §2, §3, §9, `docs/REVIEW-NOTES.md` Punkt 10.

## Ziel

Ein startbares, dunkles Electron-Fenster mit fünf navigierbaren, **leeren** Views, gehärteten
Security-Flags und grüner Werkzeugkette (`dev`, `test`, `lint`, `build`).
Fundament. **Keine** Fachlogik, **kein** Netzwerkcode.

## Dateien

```
package.json          "type": "module"; "main": "src/main/index.js"; name/version/description/
                      author (electron-builder braucht sie); scripts siehe unten
vite.config.js        root 'src/renderer', build.outDir '../../dist/renderer', base './',
                      plugin-vue, server.strictPort true
vitest.config.js      environment 'node', include ['tests/**/*.test.js']
eslint.config.js      Flat config, ESM; Override { files:['src/preload/index.cjs'],
                      languageOptions:{ sourceType:'commonjs' } }; globals via 'globals'-Paket
electron-builder.yml  linux target AppImage
.gitignore            node_modules, dist, release
scripts/dev.mjs       Vite via JS-API, dann Electron als einziger Kindprozess

src/main/windowOptions.js  export const BROWSER_WINDOW_OPTIONS
src/main/index.js          Bootstrap, single-instance, Fenster, re-export der Options
src/main/ipc.js            EINZIGER ipcMain.handle-Ort; in S01 genau ein Kanal: 'app.version'
src/preload/index.cjs      contextBridge: { appVersion: () => ipcRenderer.invoke('app.version') }

src/renderer/index.html
src/renderer/main.js                 createApp, importiert theme.css + sweetalert2-CSS
src/renderer/App.vue                 Shell, Sidebar, <component :is>, Versionsanzeige
src/renderer/state.js                export const activeView = ref('connect')
src/renderer/styles/theme.css        Tokens + swal2-Dark-Overrides
src/renderer/views/{Connect,Dashboard,Users,Groups,Import}View.vue   je ~8 Zeilen Platzhalter

tests/mainWindow.test.js   importiert windowOptions.js DIREKT, kein electron-Mock
```

## Festgelegt — hier wird nicht geraten

**npm-Scripts** (Namen aus CLAUDE.md, Kommandos hier verbindlich):
```
dev   : node scripts/dev.mjs
test  : vitest run
lint  : eslint .
build : vite build && electron-builder --linux AppImage
```

**`app.version`** ist ein **IPC-Kanal**, keine lokale Preload-Auswertung: mit `sandbox: true`
sieht das Preload nur `ipcRenderer`/`contextBridge`/`webFrame`/`crashReporter`/`nativeImage`, und
`process.versions` kennt die App-Version nicht. `src/main/ipc.js` registriert
`ipcMain.handle('app.version', () => ({ ok: true, version: app.getVersion() }))`.
Preload exponiert `appVersion` als **async Funktion**, nicht als Wert — gleiche Aufrufform wie
alle späteren Kanäle. Der Kanal steht jetzt auch in ARCHITECTURE §3.

**Theme-Tokens** in `theme.css`, genau diese sechs, keine Erfindungen in Folgeschritten:
```
--bg: #15181d  --bg-elev: #1d2128  --fg: #e6e8eb
--fg-muted: #9aa3ad  --accent: #4a9eff  --border: #2b313a
```
swal2 dunkel **nur** per CSS-Variablen-Override in `theme.css`. **Kein** `@sweetalert2/theme-dark`
— neue Abhängigkeiten sind verboten.

**`renderer/main.js` importiert in S01 nur das swal2-CSS**, nicht das Modul. Ein unbenutztes
`import Swal from 'sweetalert2'` würde `npm run lint` brechen und damit Abnahme 6 widersprechen.

**Sidebar-Labels und Startansicht** (Umbenennen später kostet jeden Schritt):
`Verbindung` · `Dashboard` · `Benutzer` · `Gruppen` · `Import`, `activeView = 'connect'`.

**Fenster:** `backgroundColor: '#15181d'`, `show: false`, Anzeige erst bei `ready-to-show`
(verhindert weißes Aufblitzen). DevTools öffnen **nicht** automatisch.
`second-instance` fokussiert das bestehende Fenster.

**Pfadauflösung:** `import.meta.dirname` ist erlaubt und bevorzugt (Node >= 20.11, also jedes
Electron >= 29); `fileURLToPath(new URL(...))` ist die Alternative. `__dirname` existiert in
ESM nicht.

**Electron-Version:** `>= 28` ist Untergrenze. Exakt die aktuelle stabile Major installieren,
pinnen und in `docs/PLAN.md` unter „Hinweise zur Umsetzung" eintragen.

## Harte Vorgaben

- **Security-Flags** (REVIEW-NOTES 10, ARCHITECTURE §9): `contextIsolation: true`,
  `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. Nicht abschalten, auch nicht
  „nur für die Entwicklung".
- **`setWindowOpenHandler` verweigert alles**, `will-navigate` blockt externe Navigation.
  Dieser Schritt existiert genau dafür — nicht auf später verschieben.
- **Kein top-level `await`** in `src/main/index.js` vor `app.whenReady()` und vor der
  Listener-Registrierung. ESM-Main wird asynchron geladen; sonst wird `ready` verpasst und das
  Fenster öffnet nie. Das ist der teuerste Fehler in diesem Schritt.
- **Preload ist CommonJS.** `sandbox: true` lädt keine ESM-Preloads. Alles andere ESM.
- **Preload-API ist namentlich.** In S01 genau ein Feld: `appVersion`. **Kein** generischer
  `invoke(channel, ...)`-Durchgriff, jetzt und nie.
- **`base: './'`** in `vite.config.js`. Fehlt es, lädt das gepackte Fenster über `file://` nichts.
- UI-Texte deutsch, Identifier englisch. Dark Theme only, kein Light-Pfad.
- Kommentare: eine kurze Zeile, nur wo nützlich. Keine Blockkommentare.

## Abnahmekriterien

1. `npm install` läuft fehlerfrei durch. *(manuell)*
2. `npm run dev` öffnet ein dunkles Fenster ohne weißes Aufblitzen. Beenden eines Prozesses
   beendet den anderen; keine Waisenprozesse. *(manuell)*
3. Alle fünf Views sind über die Sidebar erreichbar und zeigen ihren Namen als Überschrift.
   *(manuell)*
4. Das Fenster zeigt die App-Version, bezogen über `await window.api.appVersion()`.
   Beweis, dass die IPC-Brücke steht. *(manuell)*
5. `npm test` grün. `tests/mainWindow.test.js` importiert `src/main/windowOptions.js` **ohne
   electron-Mock** und behauptet fünf Dinge: `contextIsolation === true`, `sandbox === true`,
   `nodeIntegration === false`, `webSecurity !== false`, `preload` endet auf `index.cjs`.
   Zusätzlich `backgroundColor === '#15181d'` — das macht „dunkel" automatisiert prüfbar.
   *(automatisiert)*
6. `npm run lint` grün, inklusive der CommonJS-Preload-Datei. *(automatisiert)*
7. **7a** Nach `vite build` startet `npx electron .` **ohne** `VITE_DEV_SERVER_URL`, lädt
   `dist/renderer/index.html` über `file://` und zeigt Inhalt. Das ist der eigentliche Nachweis
   für `base: './'` und die Pfadauflösung und dauert Sekunden. *(manuell, schnell)*
   **7b** `npm run build` erzeugt eine startende AppImage. Nur auf einer Maschine mit Display
   prüfbar; headless ist „nicht ausgeführt, headless" in `docs/MANUAL-TEST.md` zu vermerken —
   **nicht** als grün behaupten. *(manuell)*

## Ausdrücklich NICHT in diesem Schritt

- In `src/main/` existieren **nur** `index.js`, `windowOptions.js`, `ipc.js`. Kein `session.js`,
  `tls.js`, `log.js`, `credentials.js`, kein `ocs/`, kein `actions/`.
- **Kein** Modul in `src/shared/` — keines. Auch nicht „schon mal angelegt".
- Kein OCS-Client, kein `fetch`, kein Netzwerkcode, keine URL-Verarbeitung.
- Keine Credentials, kein `safeStorage`, kein TLS-/Zertifikats-Handler.
- Kein Username-Generator, kein CSV, kein Quota, keine Pipeline, kein Pool.
- Keine Tabelle, keine Filter, keine swal2-**Dialoge**.
- Keine `state.js`-Felder außer `activeView`.
- Keine weiteren IPC-Kanäle als `app.version`.
- Kein `vue-router`, kein Pinia, kein `concurrently`, kein `electron-vite`.
- **Keine devDependencies außer den oben gelisteten.**

## Bewusste Abweichung von MANUAL-TEST #6

#6 verlangt, dass Views ohne Verbindung gesperrt sind. In S01 sind alle fünf frei erreichbar,
weil es noch kein Verbindungskonzept gibt. Das Gating kommt in S04. Der Reviewer soll das
**nicht** als Fehler werten, und der Coder soll es **nicht** vorbauen.

## Hinweis für den Tester

Automatisiert sind in S01 nur Abnahme 5 und 6. Punkte 1, 2, 3, 4, 7a, 7b sind manuell.
**Erfinde keine Vue-Komponententests** — die Architektur schließt sie ausdrücklich aus.
Berichte 7b ehrlich als „nicht ausgeführt", falls kein Display verfügbar ist.
