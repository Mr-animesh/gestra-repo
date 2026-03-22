const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Keep the small window above other apps (floating palette). Default: off (works in background). */
  setPinAbove: (enabled) => ipcRenderer.invoke('set-pin-above', enabled),
  getWindowMode: () => ipcRenderer.invoke('get-window-mode'),
  /** Reach python-core HTTP API via main process (127.0.0.1:8765 by default). */
  pythonBridge: (payload) => ipcRenderer.invoke('python-bridge', payload),
  performAction: (action, options) => {
    console.log('[GestureOS/Preload] performAction → IPC', action, options ?? '');
    return ipcRenderer.invoke('perform-action', { action, options: options ?? null });
  },
  toggleOverlayMode: (enabled) => ipcRenderer.invoke('set-overlay-mode', enabled),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  assistantRequest: (payload) => ipcRenderer.invoke('assistant-request', payload),
});
