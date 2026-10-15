# S27 App-Icon

## Ziel
Die App hat das Icon des Nutzers (Nutzerwunsch 2026-10-15, Dateien in `icons/`):
- im gebauten AppImage (Desktop-Integration, `.DirIcon`, hicolor-Icons);
- als `BrowserWindow`-Icon-Option. Sichtbar unter X11/XWayland; unter Wayland bestimmt der Compositor das Taskleisten-Icon über die .desktop-Datei/app_id, dort also nur über die AppImage-Integration. Das ist keine harte Abnahme.

## Vorhanden (nicht ändern, nicht neu erzeugen)
`icons/` mit `16x16.png` … `1024x1024.png`, `icon.png`, `icon.ico`, `icon.icns`, `icon.svg`.

## Dateien
- `electron-builder.yml`:
  - `linux.icon: icons` (Build-Zeit, liest `<N>x<N>.png` aus dem Projektverzeichnis);
  - in `files` der **exakte** Eintrag `icons/256x256.png` (nur diese Datei wird zur Laufzeit gebraucht, kein `icons/**/*`).
- `src/main/windowOptions.js`: `icon` in `BROWSER_WINDOW_OPTIONS` als **String-Pfad** `path.join(import.meta.dirname, '..', '..', 'icons', '256x256.png')` (gleiches Muster wie `preloadPath`). Kein `nativeImage`, kein `electron`-Import in dieser Datei.
- Tests: `tests/mainWindow.test.js` (Kriterium 1), `tests/packaging.test.js` (Kriterium 2).
- Kein `asarUnpack`, kein `extraResources`.

## Akzeptanz
1. `tests/mainWindow.test.js`: `BROWSER_WINDOW_OPTIONS.icon` ist `path.isAbsolute`, `existsSync` und beginnt mit der PNG-Signatur `\x89PNG\r\n\x1a\n`. Sicherheitsflags unverändert, bestehende Tests grün.
2. `tests/packaging.test.js`: importiert `BROWSER_WINDOW_OPTIONS`, bildet den projektrelativen Pfad mit dem vorhandenen `rel()` (nicht hartkodiert) und prüft mit den vorhandenen `parseFiles`/`isCovered`: gedeckt und nicht ausgeschlossen. Außerdem: `linux.icon` in `electron-builder.yml` ist `icons` (einfacher Zeilen-Check, kein YAML-Paket).
3. Build-Beweis (Tester, im Scratch-Verzeichnis, nicht committen): `npm run build`, dann `--appimage-extract`:
   - `usr/share/icons/hicolor/256x256/apps/*.png` ist byte-gleich (`cmp`) zu `icons/256x256.png`; falls app-builder neu kodiert: `.DirIcon` visuell prüfen (Read-Tool), dass es das Nutzer-Icon und nicht das Electron-Logo ist.
   - `npx @electron/asar list squashfs-root/resources/app.asar | grep '/icons/256x256.png'` trifft.
4. `npm test`, `npm run lint` grün.

## Nicht im Scope
- Kein Icon in der UI (Sidebar, About-Karte), kein Favicon, keine Tray-Icons.
- Keine Windows-/macOS-Targets (`.ico`/`.icns` bleiben ungenutzt liegen).
- Keine Bildbearbeitung, keine neuen Größen.
