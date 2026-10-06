import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { BROWSER_WINDOW_OPTIONS, applyNavigationGuards } from './windowOptions.js';
import { registerIpcHandlers } from './ipc.js';

export { BROWSER_WINDOW_OPTIONS };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;

  async function createWindow() {
    mainWindow = new BrowserWindow(BROWSER_WINDOW_OPTIONS);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    applyNavigationGuards(mainWindow.webContents);

    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    try {
      if (devServerUrl) {
        await mainWindow.loadURL(devServerUrl);
      } else {
        await mainWindow.loadFile(path.join(import.meta.dirname, '..', '..', 'dist', 'renderer', 'index.html'));
      }
    } catch (error) {
      console.error('Failed to load renderer content:', error);
    }
  }

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady()
    .then(async () => {
      registerIpcHandlers();
      await createWindow();
    })
    .catch((error) => {
      console.error('Fatal error during startup:', error);
      app.exit(1);
    });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
