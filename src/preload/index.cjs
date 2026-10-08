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
  usersList: () => ipcRenderer.invoke('users.list'),
  // Returns a disposer so a remount never stacks listeners.
  onUsersLoadProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('users.onLoadProgress', listener);
    return () => ipcRenderer.removeListener('users.onLoadProgress', listener);
  },
  actionsRun: (args) => ipcRenderer.invoke('actions.run', args),
  actionsStop: (args) => ipcRenderer.invoke('actions.stop', args),
  // Returns a disposer so a remount never stacks listeners.
  onActionsProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('actions.onProgress', listener);
    return () => ipcRenderer.removeListener('actions.onProgress', listener);
  },
  filesSaveCsv: (args) => ipcRenderer.invoke('files.saveCsv', args),
  groupsList: () => ipcRenderer.invoke('groups.list'),
  groupsCreate: (args) => ipcRenderer.invoke('groups.create', args),
  filesOpenCsv: (args) => ipcRenderer.invoke('files.openCsv', args),
});
