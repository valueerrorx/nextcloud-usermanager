import path from 'node:path';

const preloadPath = path.join(import.meta.dirname, '..', 'preload', 'index.cjs');

// Security flags are fixed, never disabled (REVIEW-NOTES 10, ARCHITECTURE §9).
export const BROWSER_WINDOW_OPTIONS = {
  width: 1800,
  height: 1000,
  backgroundColor: '#0d1117',
  show: false,
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
  },
};

// Denies all new windows and blocks navigation away from the loaded URL (electron-free, unit-testable).
export function applyNavigationGuards(webContents) {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Shared decision so both listeners can never diverge on what counts as disallowed.
  const isDisallowed = (targetUrl) => targetUrl !== webContents.getURL();

  webContents.on('will-navigate', (event, url) => {
    if (isDisallowed(url)) {
      event.preventDefault();
    }
  });

  // will-navigate only covers the main frame; sub-frames need their own guard.
  // Electron 44 emits a single details object here (details.url, details.preventDefault()).
  webContents.on('will-frame-navigate', (details) => {
    if (isDisallowed(details.url)) {
      details.preventDefault();
    }
  });
}
