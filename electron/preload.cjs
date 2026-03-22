const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  executeAction: (gesture) => ipcRenderer.invoke('execute-action', gesture),
  toggleOverlayMode: (enabled) => ipcRenderer.invoke('set-overlay-mode', enabled),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  assistantRequest: (payload) => ipcRenderer.invoke('assistant-request', payload),
});
