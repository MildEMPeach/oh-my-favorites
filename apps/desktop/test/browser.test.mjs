import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadSource(relativePath, electron) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8").replaceAll("import.meta.dirname", "__dirname");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, __dirname: "/desktop", URL, process: { env: {}, platform: "linux" },
    require: (name) => name === "electron" ? electron : require(name)
  });
  return exports;
}

test("default browser IPC opens only http(s) URLs requested by the app", async () => {
  const handlers = new Map();
  const opened = [];
  const webContents = { mainFrame: {}, on() {} };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  loadSource("../src/main/index.ts", {
    app: { setName() {}, whenReady: () => Promise.resolve(), on() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} },
    shell: { openExternal: async (url) => { opened.push(url); } },
    BrowserWindow: class {
      webContents = webContents;
      contentView = { addChildView() {} };
      loadFile() { return Promise.resolve(); }
      on() {}
    },
    WebContentsView: class {
      webContents = { setWindowOpenHandler() {}, on() {}, session: { setPermissionRequestHandler() {} } };
      setVisible() {}
    }
  });
  await Promise.resolve();
  const open = handlers.get("browser:open-external");
  assert.equal(typeof open, "function");
  for (const url of ["http://example.com", "https://example.com/article?q=1"]) {
    await open(event, url);
  }
  assert.deepEqual(opened, ["http://example.com/", "https://example.com/article?q=1"]);
  for (const url of [null, undefined, {}, "not a URL", "file:///tmp/test", "javascript:alert(1)", "mailto:test@example.com", "ftp://example.com", "data:text/html,test"]) {
    await assert.rejects(open(event, url), /Only http\(s\)/);
  }
  await assert.rejects(open({ sender: {} }, "https://example.com"), /Only the app/);
  await assert.rejects(open({ sender: webContents, senderFrame: {} }, "https://example.com"), /Only the app/);
  assert.equal(opened.length, 2);
});

test("preload forwards the default browser request and propagates failures", async () => {
  let bridge;
  const calls = [];
  loadSource("../src/preload/index.ts", {
    contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, "favorites"); bridge = api; } },
    ipcRenderer: {
      invoke: async (...args) => { calls.push(args); throw new Error("Browser launch failed"); }
    }
  });
  assert.equal(Object.keys(bridge).some((key) => key.toLowerCase().includes("eagle")), false);
  await assert.rejects(bridge.openExternal("https://example.com"), /Browser launch failed/);
  assert.deepEqual(calls, [["browser:open-external", "https://example.com"]]);
});

