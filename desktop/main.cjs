const { app, BrowserWindow, dialog, Menu, ipcMain, safeStorage } = require("electron");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const {
  BACKEND,
  FRONTEND,
  LOCAL_URI,
  API_PORT,
  WEB_PORT,
  API_URL,
  isAtlasUri,
} = require("./env.cjs");
const { ensureMongo } = require("./mongo.cjs");
const { SyncWorker } = require("./sync-worker.cjs");
const { collectSetup, parseConfig, isLocalEmpty, ensureUser, createStore } = require("./setup.cjs");
const { loadJson, saveJson, restoreBsonToLocal } = require("./sync-protocol.cjs");
const { backupLocal } = require("./backup-local.cjs");

let backendProc = null;
let frontendProc = null;
let mongoProc = null;
let mainWindow = null;
let syncWorker = null;
let profile = {};
const sessionSecret = crypto.randomBytes(32).toString("hex");
let store;
let activeUri = LOCAL_URI;
let shuttingDown = false;
let restartRequested = false;

function logLine(message) {
  if (message) console.log(message);
}

function waitForPort(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Port ${port} did not open in time`));
          return;
        }
        setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

function waitForHttp(url, timeoutMs = 40000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    function retry() {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tryOnce, 400);
    }
    tryOnce();
  });
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

function spawnLogged(command, args, opts) {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  child.stdout.on("data", (buf) => logLine(`[${opts.name}] ${String(buf).trimEnd()}`));
  child.stderr.on("data", (buf) => logLine(`[${opts.name}] ${String(buf).trimEnd()}`));
  child.on("exit", (code) => {
    if (!shuttingDown && code) {
      logLine(`[${opts.name}] exited with code ${code}`);
    }
  });
  return child;
}

function backendEnv() {
  return {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(API_PORT),
    MONGODB_URI: activeUri,
    DESKTOP_LOCAL_PIN_HASH: profile.pinHash || "",
    JWT_SECRET: sessionSecret,
    CORS_ORIGIN: `http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}`,
    COOKIE_INSECURE: "true",
    COOKIE_DOMAIN: "",
    VERCEL: "",
  };
}

async function stopChildren() {
  syncWorker?.stop();
  for (const child of [frontendProc, backendProc, mongoProc]) {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) continue;
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      if (!child.kill("SIGTERM")) { clearTimeout(timer); resolve(); }
    });
  }
}

function nodeSpawn(args, opts) {
  return spawnLogged(process.execPath, args, {
    ...opts,
    env: { ...opts.env, ELECTRON_RUN_AS_NODE: "1" },
  });
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Setup and recovery…",
          click: async () => {
            if (!syncWorker || shuttingDown) return;
            const choice = await dialog.showMessageBox(mainWindow, {
              message: "Restart into desktop setup and recovery?",
              detail: "Save your work first. The factory app will be closed during recovery.",
              buttons: ["Cancel", "Restart"], cancelId: 0, defaultId: 0,
            });
            if (choice.response !== 1 || shuttingDown) return;
            saveJson(path.join(app.getPath("userData"), "setup-request.json"), { requested: true });
            restartRequested = true;
            app.quit();
          },
        },
        {
          label: "Back up to cloud now",
          click: async () => {
            if (!syncWorker) return;
            await syncWorker.upload();
            await dialog.showMessageBox(mainWindow, {
              type: ["synced", "up-to-date"].includes(syncWorker.getStatus().state) ? "info" : "warning",
              title: "Cloud backup",
              message: ["synced", "up-to-date"].includes(syncWorker.getStatus().state) ? "Backup complete" : "Backup not completed",
              detail: syncWorker.getStatus().error || "The local app remains available offline.",
            });
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function startServers() {
  const mongo = await ensureMongo(app.getPath("userData"));
  mongoProc = mongo.child;

  const userData = app.getPath("userData");
  const profilePath = path.join(userData, "desktop-profile.json");
  const requestPath = path.join(userData, "setup-request.json");
  profile = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, "utf8")) : {};
  if (profile.database && !/^ke_restore_[a-f0-9]{24}$/.test(profile.database)) throw new Error("Invalid desktop database selection");
  if (profile.database) activeUri = `mongodb://127.0.0.1:27017/${profile.database}`;
  const mongoose = require(path.join(BACKEND, "node_modules/mongoose"));
  try {
    store = createStore(userData, { safeStorage });
    store.read();
  } catch { store = undefined; }
  const configured = /^[a-f0-9]{64}$/.test(profile.jwtSecret || "");
  if (!configured || loadJson(requestPath).requested) {
    const completed = await collectSetup({
      parent: mainWindow, setupPage: path.join(__dirname, "setup.html"), preload: path.join(__dirname, "preload.cjs"),
      apply: async (values, window) => {
        const cloud = values.mode === "cloud" || values.mode === "recover";
        const restore = values.mode === "recover" || values.mode === "import";
        if (!cloud && !restore && values.mode !== "local") throw new Error("Invalid setup action");
        const config = cloud ? parseConfig(values) : null;
        if (cloud && !store) store = createStore(userData, { safeStorage });
        const client = new SyncWorker({ userData, localUri: activeUri, backendDir: BACKEND, store });
        let database = profile.database;
        let nextUri = activeUri;
        if (restore) {
          if (!await isLocalEmpty(activeUri, BACKEND)) {
            const confirmation = await dialog.showMessageBox(window, {
              type: "warning", message: "Switch to the restored database?",
              detail: "Current records will not be merged. The original database and a local safety copy will be kept.",
              buttons: ["Cancel", "Restore"], defaultId: 0, cancelId: 0,
            });
            if (confirmation.response !== 1) throw new Error("Restore cancelled");
          }
          let archive;
          if (config) archive = await client.downloadLatest(config);
          else {
            const file = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: [{ name: "Desktop backup", extensions: ["gz"] }] });
            if (file.canceled) throw new Error("Import cancelled");
            if ((await fs.promises.stat(file.filePaths[0])).size > 250 * 1024 * 1024) throw new Error("Archive is too large");
            archive = await fs.promises.readFile(file.filePaths[0]);
          }
          await backupLocal({ userData, uri: activeUri, mongoose });
          database = `ke_restore_${crypto.randomBytes(12).toString("hex")}`;
          nextUri = `mongodb://127.0.0.1:27017/${database}`;
          await restoreBsonToLocal({ archive, uri: nextUri, mongoose });
        } else if (config) {
          const { upload } = await client.request("/api/sync/latest", {}, config);
          const prior = store.read();
          if (upload && (prior.deviceId !== config.deviceId || prior.encryptionKey !== config.encryptionKey || prior.cloudApiUrl !== config.cloudApiUrl)) {
            throw new Error("This device already has cloud data. Choose Restore instead of replacing its cloud backup.");
          }
        }
        await ensureUser(nextUri, mongoose);
        const next = { database, pinHash: profile.pinHash, jwtSecret: configured ? profile.jwtSecret : crypto.randomBytes(32).toString("hex"), cloudEnabled: cloud };
        if (config) store.write(config);
        saveJson(profilePath, next);
        profile = next;
        activeUri = nextUri;
      },
    });
    fs.rmSync(requestPath, { force: true });
    if (!completed && !configured) { app.quit(); return false; }
  }

  if (!app.isPackaged) {
    const built = spawnSync(process.execPath, [path.join(__dirname, "ensure-frontend-build.cjs")], {
      cwd: __dirname,
      stdio: "inherit",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    if (built.status !== 0) {
      throw new Error("Could not build the desktop UI.");
    }
  }

  const env = backendEnv();
  if (isAtlasUri(env.MONGODB_URI)) {
    throw new Error("Desktop refused to start because Mongo URI pointed at Atlas.");
  }

  if (await portIsOpen(API_PORT) || await portIsOpen(WEB_PORT)) {
    throw new Error("Another program is using the desktop app’s local ports. Close it and reopen the app.");
  }
  const serverJs = path.join(BACKEND, "src/server.js");
  backendProc = nodeSpawn([serverJs], {
    cwd: BACKEND,
    env,
    name: "api",
  });
  await waitForPort(API_PORT);

  const standalone = path.join(FRONTEND, "server.js");
  const nextBin = path.join(FRONTEND, "node_modules/next/dist/bin/next");
  if (fs.existsSync(standalone)) {
    frontendProc = nodeSpawn([standalone], {
      cwd: FRONTEND,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(WEB_PORT),
        HOSTNAME: "127.0.0.1",
        BACKEND_URL: `http://127.0.0.1:${API_PORT}`,
        NEXT_PUBLIC_API_URL: API_URL,
      },
      name: "ui",
    });
  } else {
    frontendProc = nodeSpawn(
      [nextBin, "start", "-H", "127.0.0.1", "-p", String(WEB_PORT)],
      {
        cwd: FRONTEND,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(WEB_PORT),
          BACKEND_URL: `http://127.0.0.1:${API_PORT}`,
          KE_DESKTOP_BUILD: "1",
          NEXT_PUBLIC_API_URL: API_URL,
          ELECTRON_RUN_AS_NODE: "1",
        },
        name: "ui",
      }
    );
  }
  await waitForHttp(`http://127.0.0.1:${WEB_PORT}/api/health`);
  syncWorker = new SyncWorker({ userData, localUri: activeUri, backendDir: BACKEND,
    store: profile.cloudEnabled ? store : undefined,
    onStatus: (status) => logLine(`[backup] ${status.state}`),
  });
  syncWorker.start();
  if (profile.cloudEnabled && !store) syncWorker.setStatus({ state: "failed", error: "Protected backup settings are unavailable" });
  return true;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: "#0f2744",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Khan Engineerings",
  });

  await mainWindow.loadFile(path.join(__dirname, "splash.html"));
  mainWindow.maximize();
  mainWindow.show();

  try {
    if (!await startServers()) return;
    const origin = `http://127.0.0.1:${WEB_PORT}`;
    await mainWindow.webContents.session.cookies.remove(origin, "token");
    await mainWindow.loadURL(origin);
    mainWindow.webContents.setZoomFactor(1);
  } catch (err) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Could not start",
      message: err.message || String(err),
    });
    app.quit();
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.isModal()) || mainWindow;
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.whenReady().then(async () => {
    ipcMain.handle("sync-status", () => syncWorker?.getStatus() || { state: "starting", pending: false });
    ipcMain.handle("sync-now", async () => {
      if (syncWorker) await syncWorker.upload();
      return syncWorker?.getStatus() || { state: "disabled", pending: false };
    });
    buildMenu();
    await createWindow();
  });
}

app.on("window-all-closed", () => app.quit());

let childrenStopped = false;
app.on("before-quit", (event) => {
  if (childrenStopped) return;
  event.preventDefault();
  if (shuttingDown) return;
  shuttingDown = true;
  void stopChildren().finally(() => {
    childrenStopped = true;
    if (restartRequested) app.relaunch();
    app.quit();
  });
});
