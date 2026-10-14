# S25 CI-Release-Workflow härten + Startfenster klemmen

## Anlass
Review der Commits nach S18 (MAJOR/MINOR):
- `.github/workflows/appimage.yml`: `contents: write` für den ganzen Workflow, Checkout behält
  Credentials, während `npm ci` Fremd-Installskripte ausführt; Actions per Tag statt SHA gepinnt;
  kein Test-/Lint-Gate vor dem Release; keine `concurrency`-Gruppe.
  (`--target ${GITHUB_SHA}` ist inzwischen vorhanden.)
- `src/main/windowOptions.js`: festes 1800x1000-Fenster ist größer als gängige 1366x768- und
  1600x900-Bildschirme.

## Umsetzung
- `.github/workflows/appimage.yml`, Verhalten sonst unverändert (Versionserkennung, Trigger,
  `--publish never`, Tag/Titel/Notes, `--target`):
  - Top-Level `permissions: contents: read`.
  - Job `build`, `permissions: contents: read` bewusst explizit (macht die Prüfung „genau ein
    Job mit write“ eindeutig):
    - Checkout mit `persist-credentials: false` und `fetch-depth: 0`.
    - Versionserkennung; im env dieses Steps `GH_TOKEN` **und** `GH_REPO: ${{ github.repository }}`.
    - Nur bei `publish == 'true'`: Setup Node, `npm ci`, `npm run lint`, `npm test`, Build, dann
      `actions/upload-artifact` mit `name: appimage`, `path: release/*.AppImage`,
      `if-no-files-found: error`, `retention-days: 1`.
    - `outputs: { publish: ${{ steps.version.outputs.publish }}, version: ${{ steps.version.outputs.version }} }`.
  - Job `release` (`needs: build`, `if: needs.build.outputs.publish == 'true'`,
    `permissions: contents: write`): **kein** Checkout, **kein** `npm`.
    - `actions/download-artifact` mit `name: appimage`, `path: release`.
    - Dann `gh release create "$tag" release/*.AppImage --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" …`.
    - `VERSION` aus `needs.build.outputs.version`.
  - `concurrency: { group: appimage-release, cancel-in-progress: false }`. Bewusst akzeptiert:
    GitHub hält nur einen wartenden Lauf, ein neuerer Push ersetzt einen wartenden älteren. Eine
    Zwischenversion kann so ausfallen, die neueste wird über den History-Fallback plus
    `gh release view` trotzdem veröffentlicht.
  - SHA-Pinning:
    - Betroffen: `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`,
      `actions/download-artifact`.
    - Gepinnt wird auf die **Commit**-SHA des neuesten v4-Tags (annotierte Tags auflösen per
      `git ls-remote --tags https://github.com/<action> 'v4*'`, Zeile mit `^{}`).
    - Kommentar mit exakter Version, z. B. `# v4.2.2`.
    - SHAs im Bericht nennen.
- `src/main/windowOptions.js`: `fitWindowSize(workArea)`. Die Bevorzugte Größe kommt aus
  `BROWSER_WINDOW_OPTIONS.width/height`, die einzige Stelle mit 1800/1000; die Konstante bleibt
  unverändert.
  - Ergebnis ist `min(bevorzugt, workArea)` je Achse.
  - Ist `workArea` ungültig (fehlt, oder eine Achse ist keine endliche positive Zahl), gilt die
    bevorzugte Größe.
  - Das Modul bleibt electron-frei.
- `src/main/index.js`:
  - `screen` zum electron-Import ergänzen.
  - In `createWindow()`: `new BrowserWindow({ ...BROWSER_WINDOW_OPTIONS, ...fitWindowSize(screen.getPrimaryDisplay().workAreaSize) })`.
  - Kein x/y, Electron zentriert das Fenster selbst.

## Akzeptanz
1. In `tests/mainWindow.test.js`, neuer `describe('fitWindowSize')`:

   | Eingabe | Ergebnis |
   |---|---|
   | `{ width: 1366, height: 728 }` | `{ width: 1366, height: 728 }` |
   | `{ width: 2560, height: 1400 }` | `{ width: 1800, height: 1000 }` |
   | `{ width: 1600, height: 860 }` | `{ width: 1600, height: 860 }` |
   | `undefined` | `{ width: 1800, height: 1000 }` |
   | `{ width: 0, height: 0 }` | `{ width: 1800, height: 1000 }` |
   | `{ width: NaN, height: 900 }` | `{ width: 1800, height: 1000 }` |
   | `{ width: 1366 }` | `{ width: 1800, height: 1000 }` |

2. Die bestehenden Security-Flag-Tests bleiben grün. `BROWSER_WINDOW_OPTIONS` ist unverändert.
3. Workflow, statisch geprüft, kein Unit-Test:
   - `grep -nE 'uses: [^@]+@v[0-9]' .github/workflows/appimage.yml` ist leer.
   - Genau ein Job hat `contents: write`, und dieser Job enthält weder `actions/checkout` noch
     `npm`.
   - Checkout hat `persist-credentials: false`.
   - `npm run lint` und `npm test` laufen vor dem Build.
   - `concurrency` ist gesetzt.
   - Upload- und Download-Pfade passen zur `gh`-Zeile.
   - YAML-Prüfung in dieser Reihenfolge: das `actionlint`-Binary, falls installiert; sonst
     `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))"`; geht beides nicht, steht
     „YAML nicht maschinell geprüft“ im Bericht.
4. `npm test`, `npm run lint`, `npm run build` grün.

## Nicht im Scope
- Trigger, Versionslogik, Artefaktname, Signierung.
- Fensterposition/-zustand speichern.
