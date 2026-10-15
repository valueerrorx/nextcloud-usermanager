# S26 Packaging-Guard-Test

## Ziel
Ein Unit-Test schlägt fehl, wenn das gepackte Artefakt ein Modul nicht enthält, das Main oder Preload zur Laufzeit lädt. Anlass: Nutzer-Commit `5de828d` — `src/shared/**` fehlte in `electron-builder.yml`, das AppImage startete nicht, Tests und Lint waren grün.

## Dateien
- neu: `tests/packaging.test.js`
- keine Änderung an `src/`, `electron-builder.yml` oder `package.json` (keine neue Abhängigkeit)

## Verhalten
1. Startpunkte: `main`-Feld aus `package.json` (`src/main/index.js`) und alle Dateien unter `src/preload/` (aktuell `index.cjs`).
2. Specifier-Extraktion per Regex über den **ganzen Dateitext** (nicht zeilenweise; mehrzeilige Importe existieren, z. B. `src/shared/importPlan.js:10`):
   - `from\s*['"]…['"]` (deckt `import … from` und `export … from`, auch mehrzeilig)
   - `import\s*['"]…['"]` (Side-Effect-Import)
   - `import\(\s*['"]…['"]\s*\)` und `require\(\s*['"]…['"]\s*\)`
   - `import(` oder `require(` **ohne** String-Literal als Argument -> Test rot mit Dateiname.
   - Auskommentierte Importe dürfen falsch-rot machen; kein Kommentar-Stripper.
3. Auflösung relativer Specifier (`./`, `../`): exakt der Pfad relativ zur importierenden Datei. Kein Endungs-Raten, keine Verzeichnis-/`index.js`-Auflösung. Existiert die Datei nicht (z. B. endungsloser Specifier) -> rot mit Importeur und Specifier.
4. Bare-Specifier: erlaubt sind genau `electron` und Specifier mit Präfix `node:`. Alles andere ist rot, ausdrücklich auch `fs`/`path` ohne `node:` und `electron/…`-Subpfade (wegen `!node_modules/**` in `files` fehlen Pakete im Artefakt).
5. Traversierung mit Visited-Set normalisierter absoluter Pfade (Zyklen terminieren, gemeinsame Module einmal).
6. `files`-Liste aus `electron-builder.yml`: einfacher Zeilen-Parser. Einträge sind die `  - `-Zeilen direkt unter `files:`, Parsing endet an der ersten Zeile, die kein solcher Eintrag ist. Quotes entfernen. Genau drei Formen erlaubt:
   - `<dir>/**/*` -> deckt jede Datei mit Präfix `<dir>/`
   - exakter Dateiname -> deckt genau diese Datei
   - `!<dir>/**` -> schließt jede Datei mit Präfix `<dir>/` aus
   Jede andere Form -> Test rot (fail closed).
7. Jede erreichte Datei (projektrelativ, `/`-Separatoren) sowie `package.json` und die `main`-Datei müssen von einem positiven Eintrag gedeckt und von keinem Ausschluss getroffen sein. Fehlermeldung nennt Datei und Importeur.

## Akzeptanz
- Test grün auf aktuellem Stand.
- Assertion im Test: der Graph enthält mindestens eine Datei unter `src/shared/` (kein leerer Durchlauf).
- Mutationsbeweis (vom Tester durchzuführen, danach zurücksetzen, nicht committen), jeweils rot mit sinnvoller Meldung:
  a) `- src/shared/**/*` aus `electron-builder.yml` entfernt -> nennt eine Datei unter `src/shared/`
  b) temporärer Bare-Import `import 'vue'` in einer Main-Datei
  c) temporärer endungsloser relativer Import (z. B. `'./tls'`) in einer Main-Datei
- `npm test` und `npm run lint` grün.

## Nicht im Scope
- Kein Build im Test, kein Auspacken des AppImage, kein Glob-Matcher-Paket, keine Änderungen an CI.
- Renderer (von Vite nach `dist/renderer` gebündelt).
- Zur Laufzeit per Pfad-String geladene Dateien (Preload via `path.join`, HTML, Icons) sind keine Import-Kanten; Preload ist über Startpunkte abgedeckt, mehr wird nicht erwartet.
