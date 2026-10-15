# S28 App-Icon in der Sidebar

## Ziel
Das App-Icon erscheint oben in der Sidebar links neben „Nextcloud User Manager“, wie im Microsoft365-Manager (`/home/valueerror/Nextcloud/WebDEV/Microsoft365-Manager/src/components/AppSidebar.vue` Z. 7-13). Nutzerentscheidung DECISIONS 2026-10-15 „App-Icon im UI“.

## Dateien
- `src/renderer/App.vue`: im `.sidebar-brand` ein `<img>` vor dem Namen. Quelle per Vite-Asset-Import `import appIcon from '../../icons/64x64.png'` (64px wegen HiDPI, Datei ist 2,5 KB und wird von Vite als `data:`-URL inlined; CSP erlaubt `img-src 'self' data:`). `alt=""` (rein dekorativ, Name steht daneben).
- Markup: `<img class="sidebar-brand-icon" :src="appIcon" alt="">` gefolgt von `<span>Nextcloud User Manager</span>`.
- `src/renderer/styles/theme.css`: bestehende `.sidebar-brand`-Regeln (padding, border, font) bleiben, nur `display: flex; align-items: center; gap: 0.5rem` ergänzen. Neue Klasse `.sidebar-brand-icon { width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0; }`. Keine Inline-Styles.
- Keine Änderung an `icons/`, `electron-builder.yml`, Main, Preload, CSP.

## Akzeptanz
1. `npm run build` läuft durch; `dist/renderer/assets/*.js` enthält `data:image/png;base64,` oder `dist/renderer/assets/` enthält eine `.png`.
2. `grep -rn "icons/" src/renderer` liefert genau eine Zeile: `import appIcon from '../../icons/64x64.png'` in `App.vue`.
3. `npm test`, `npm run lint` grün (ESLint-Vue-Regeln eingeschlossen).
4. Manuell (Nutzer): Sidebar zeigt Icon (28px, abgerundet) links vom Namen, vertikal zentriert, im Dev-Modus und im AppImage; DevTools-Konsole im Dev-Modus ohne CSP-Verletzung.

## Nicht im Scope
- Untertitel, Sidebar-Einklappen, Icon in About-Karte oder Verbindungs-Popup, Favicon.
- Keine Komponententest-Bibliothek einführen.
