const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  toggleArtifactFullscreen: () => ipcRenderer.invoke('toggle-artifact-fullscreen'),
  getWindowType: () => ipcRenderer.invoke('get-window-type'),
});
