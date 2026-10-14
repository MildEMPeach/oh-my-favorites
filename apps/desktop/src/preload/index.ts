import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("favorites", {
  openUrl: (url: string) => ipcRenderer.invoke("browser:open", url),
  openExternal: (url: string) => ipcRenderer.invoke("browser:open-external", url),
  confirmDiscard: () => ipcRenderer.invoke("notes:discard"),
  setBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.send("browser:set-bounds", bounds),
  hideBrowser: () => ipcRenderer.send("browser:hide"),
  showBrowser: () => ipcRenderer.send("browser:show")
});
