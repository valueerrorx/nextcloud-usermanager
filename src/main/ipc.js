import { ipcMain, app } from 'electron';

// Only place with ipcMain.handle/on (ARCHITECTURE §2).
export function registerIpcHandlers() {
  ipcMain.handle('app.version', () => ({ ok: true, version: app.getVersion() }));
}
