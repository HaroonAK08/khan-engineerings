const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("khanDesktop", {
  isDesktop: true,
});
