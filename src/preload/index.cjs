const { contextBridge, ipcRenderer } = require('electron');

// Preload API is named explicitly; no generic invoke(channel, ...) passthrough (REVIEW-NOTES 10).
contextBridge.exposeInMainWorld('api', {
  appVersion: () => ipcRenderer.invoke('app.version'),
  connect: (args) => ipcRenderer.invoke('connection.connect', args),
  connectSaved: () => ipcRenderer.invoke('connection.connectSaved'),
  connectionStatus: () => ipcRenderer.invoke('connection.status'),
  forgetSaved: () => ipcRenderer.invoke('connection.forgetSaved'),
  respondCertificate: (args) => ipcRenderer.invoke('tls.respondCertificate', args),
  // Returns a disposer so a remount never stacks listeners.
  onCertificatePrompt: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('tls.onCertificatePrompt', listener);
    return () => ipcRenderer.removeListener('tls.onCertificatePrompt', listener);
  },
});
