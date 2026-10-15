# S29 App-Icon ins Dashboard (statt Sidebar)

## Ziel
Nutzer-Feedback zu S28: Icon in der Sidebar gefällt nicht. Es kommt aus der Sidebar raus und erscheint stattdessen im Dashboard oben rechts in der Kopfzeile, 48px (DECISIONS 2026-10-15 „ersetzt Sidebar-Platzierung“).

## Dateien
- `src/renderer/App.vue`: S28 rückgängig — `appIcon`-Import, `<img class="sidebar-brand-icon">` und `<span>` entfernen; `.sidebar-brand` enthält wieder nur den Text „Nextcloud User Manager“.
- `src/renderer/styles/theme.css`: S28 rückgängig — `display/align-items/gap` aus `.sidebar-brand` und die Regel `.sidebar-brand-icon` entfernen.
- `src/renderer/views/DashboardView.vue`:
  - Import `import appIcon from '../../../icons/128x128.png?inline'` (`?inline` erzwingt `data:`-URL, die Datei ist 4,9 KB > Vites Inline-Grenze; CSP erlaubt `img-src data:`; 128px für HiDPI).
  - `.page-header` des Dashboards: bestehender Inhalt (Titel + „Stand“-Zeile) in ein `<div>` links, rechts `<img class="dashboard-app-icon" :src="appIcon" alt="">`.
  - Kopfzeile mit Bootstrap-Utilities wie `UsersView.vue:227`: `class="page-header d-flex align-items-start justify-content-between gap-2"`; keine neue Header-Klasse, globale `.page-header`-Regel unverändert.
  - Einzige neue Regel im bestehenden `<style scoped>`: `.dashboard-app-icon { width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0; }`.
- Keine Änderung an anderen Views, `icons/`, `electron-builder.yml`, Main, Preload, CSP.

## Akzeptanz
1. `grep -rn "sidebar-brand-icon\|appIcon" src/renderer` trifft nur `DashboardView.vue`; `App.vue` und `theme.css` sind bzgl. `.sidebar-brand` wieder auf dem Stand vor S28 (`git diff 9acda54 -- src/renderer/App.vue src/renderer/styles/theme.css` leer, falls sonst nichts geändert).
2. Genau ein Import aus `icons/` im Renderer: `../../../icons/128x128.png?inline` in `DashboardView.vue`.
3. `npm run build` läuft durch; `dist/renderer/assets/*.js` enthält `data:image/png;base64,`; `ls dist/renderer/assets/*.png` findet nichts.
4. `npm test`, `npm run lint` grün.
5. Manuell (Nutzer): Dashboard zeigt das Icon oben rechts, 48px, Sidebar ohne Icon; keine CSP-Verletzung in der DevTools-Konsole. Ohne „Stand“-Zeile ist die Kopfzeile durch das Icon etwas höher; das ist erwartet.

## Nicht im Scope
- Icon in anderen Views, About-Karte, Verbindungs-Popup. Keine Komponententest-Bibliothek.
