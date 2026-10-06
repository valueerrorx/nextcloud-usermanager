const { contextBridge, ipcRenderer } = require('electron');

// Preload API is named explicitly; no generic invoke(channel, ...) passthrough (REVIEW-NOTES 10).
contextBridge.exposeInMainWorld('api', {
  appVersion: () => ipcRenderer.invoke('app.version'),
});
