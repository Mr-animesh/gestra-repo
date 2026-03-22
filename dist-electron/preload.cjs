"use strict";
const require$$0 = require("electron");
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var preload$1 = {};
var hasRequiredPreload;
function requirePreload() {
  if (hasRequiredPreload) return preload$1;
  hasRequiredPreload = 1;
  const { contextBridge, ipcRenderer } = require$$0;
  contextBridge.exposeInMainWorld("electronAPI", {
    executeAction: (gesture) => ipcRenderer.invoke("execute-action", gesture),
    toggleOverlayMode: (enabled) => ipcRenderer.invoke("set-overlay-mode", enabled),
    hideWindow: () => ipcRenderer.invoke("hide-window"),
    showWindow: () => ipcRenderer.invoke("show-window"),
    assistantRequest: (payload) => ipcRenderer.invoke("assistant-request", payload)
  });
  return preload$1;
}
var preloadExports = requirePreload();
const preload = /* @__PURE__ */ getDefaultExportFromCjs(preloadExports);
module.exports = preload;
