const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("khanDesktop", {
  isDesktop: true,
  getSyncStatus: () => ipcRenderer.invoke("sync-status"),
  syncNow: () => ipcRenderer.invoke("sync-now"),
  submitSetup: (values) => ipcRenderer.invoke("desktop-setup-submit", values),
  cancelSetup: () => ipcRenderer.invoke("desktop-setup-cancel"),
});
