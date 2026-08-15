const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  toggleArtifactFullscreen: () => ipcRenderer.invoke('toggle-artifact-fullscreen'),
  getWindowType: () => ipcRenderer.invoke('get-window-type'),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  windowControl: (cmd) => ipcRenderer.invoke('window-control', cmd),
  quit: () => ipcRenderer.invoke('quit-app'),
});
