const { app, BrowserWindow, dialog, Menu } = require("electron");
const { spawn, spawnSync } = require("child_process");
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
  loadEnvFile,
  isAtlasUri,
} = require("./env.cjs");
const { ensureMongo } = require("./mongo.cjs");

let backendProc = null;
let frontendProc = null;
let mongoProc = null;
let mainWindow = null;
let shuttingDown = false;

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
        if (res.statusCode && res.statusCode < 500) {
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

function mongoRunning() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: 27017 }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function spawnLogged(command, args, opts) {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
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
  const local = loadEnvFile(path.join(BACKEND, ".env"));
  const prod = loadEnvFile(path.join(BACKEND, ".env.production"));
  const jwt = local.JWT_SECRET || prod.JWT_SECRET || "desktop-offline-secret";
  return {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(API_PORT),
    MONGODB_URI: LOCAL_URI,
    JWT_SECRET: jwt,
    CORS_ORIGIN: `http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}`,
    COOKIE_INSECURE: "true",
    COOKIE_DOMAIN: "",
    VERCEL: "",
  };
}

function stopChildren() {
  shuttingDown = true;
  for (const child of [frontendProc, backendProc, mongoProc]) {
    if (!child || child.killed) continue;
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
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
          label: "Import latest cloud data",
          click: async () => {
            const choice = await dialog.showMessageBox(mainWindow, {
              type: "question",
              buttons: ["Cancel", "Import"],
              defaultId: 1,
              cancelId: 0,
              title: "Import cloud data",
              message: "Copy the latest Atlas data onto this PC?",
              detail:
                "This only reads the website database. It replaces the local desktop copy. Atlas is not deleted.",
            });
            if (choice.response !== 1) return;
            const result = spawnSync(
              process.execPath,
              [path.join(__dirname, "import-cloud-data.cjs"), "--force"],
              {
                cwd: __dirname,
                encoding: "utf8",
              }
            );
            await dialog.showMessageBox(mainWindow, {
              type: result.status === 0 ? "info" : "error",
              message: result.status === 0 ? "Import finished" : "Import failed",
              detail: `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-1500),
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

  const imported = spawnSync(
    process.execPath,
    [path.join(__dirname, "import-cloud-data.cjs")],
    {
      cwd: __dirname,
      encoding: "utf8",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    }
  );
  if (imported.stdout) logLine(imported.stdout.trim());
  if (imported.status !== 0 && imported.stderr) {
    logLine(imported.stderr.trim());
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
          NEXT_PUBLIC_API_URL: API_URL,
          ELECTRON_RUN_AS_NODE: "1",
        },
        name: "ui",
      }
    );
  }
  await waitForHttp(`http://127.0.0.1:${WEB_PORT}`);
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
  mainWindow.show();

  try {
    await startServers();
    await mainWindow.loadURL(`http://127.0.0.1:${WEB_PORT}`);
  } catch (err) {
    stopChildren();
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Could not start",
      message: err.message || String(err),
    });
    app.quit();
  }
}

app.whenReady().then(async () => {
  buildMenu();
  await createWindow();
});

app.on("window-all-closed", () => {
  stopChildren();
  app.quit();
});

app.on("before-quit", () => {
  stopChildren();
});
