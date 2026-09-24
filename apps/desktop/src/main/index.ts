import { app, BrowserWindow, ipcMain, WebContentsView } from "electron";
import { join } from "node:path";

type ViewBounds = { x: number; y: number; width: number; height: number };

let mainWindow: BrowserWindow | null = null;
let browserView: WebContentsView | null = null;

process.title = "Oh My Favorites";
app.setName("Oh My Favorites");

function developmentIconPath() {
  return join(__dirname, "../../build/icon.png");
}

function sanitizeBounds(bounds: ViewBounds): ViewBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height))
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Oh My Favorites",
    ...(process.platform !== "darwin" && process.env.ELECTRON_RENDERER_URL ? { icon: developmentIconPath() } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Renderer failed to load", { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("Preload failed", { preloadPath, error });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone", details);
  });

  browserView = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:browser"
    }
  });
  browserView.setVisible(false);
  mainWindow.contentView.addChildView(browserView);

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeBrowserUrl(url)) void browserView?.webContents.loadURL(url);
    return { action: "deny" };
  });

  browserView.webContents.on("will-navigate", (event, url) => {
    if (!isSafeBrowserUrl(url)) event.preventDefault();
  });

  browserView.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  const rendererLoad = process.env.ELECTRON_RENDERER_URL
    ? mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    : mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  void rendererLoad.catch((error) => console.error("Renderer load promise rejected", error));

  mainWindow.on("closed", () => {
    browserView = null;
    mainWindow = null;
  });
}

ipcMain.handle("browser:open", async (_event, url: string) => {
  if (!browserView) return;
  if (!isSafeBrowserUrl(url)) throw new Error("Only http(s) URLs are supported");
  const parsed = new URL(url);
  browserView.setVisible(true);
  await browserView.webContents.loadURL(parsed.toString());
});

ipcMain.on("browser:set-bounds", (_event, bounds: ViewBounds) => {
  browserView?.setBounds(sanitizeBounds(bounds));
});

ipcMain.on("browser:hide", () => {
  browserView?.setVisible(false);
});

ipcMain.on("browser:show", () => {
  browserView?.setVisible(true);
});

app.whenReady().then(() => {
  if (process.platform === "darwin" && process.env.ELECTRON_RENDERER_URL) {
    app.dock?.setIcon(developmentIconPath());
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function isSafeBrowserUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
