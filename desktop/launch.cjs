#!/usr/bin/env node
const { spawn, spawnSync } = require("child_process");
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
    logLine(`[${opts.name}] exited (${code})`);
  });
  return child;
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
}

async function main() {
  if (!(await mongoRunning())) {
    throw new Error("MongoDB is not running. Start mongod, then try again.");
  }

  const imported = spawnSync(process.execPath, [path.join(__dirname, "import-cloud-data.cjs")], {
    cwd: __dirname,
    encoding: "utf8",
  });
  if (imported.stdout) logLine(imported.stdout.trim());
  if (imported.status !== 0) {
    logLine(imported.stderr || "Cloud import skipped or failed");
  }

  const built = spawnSync(process.execPath, [path.join(__dirname, "ensure-frontend-build.cjs")], {
    cwd: __dirname,
    stdio: "inherit",
  });
  if (built.status !== 0) {
    throw new Error("Could not build the desktop UI.");
  }

  const env = backendEnv();
  if (isAtlasUri(env.MONGODB_URI)) {
    throw new Error("Desktop refused to start because Mongo URI pointed at Atlas.");
  }

  const backendProc = spawnLogged(process.execPath, [path.join(BACKEND, "src/server.js")], {
    cwd: BACKEND,
    env,
    name: "api",
  });
  await waitForPort(API_PORT);

  const nextBin = path.join(FRONTEND, "node_modules/next/dist/bin/next");
  const frontendProc = spawnLogged(
    process.execPath,
    [nextBin, "start", "-H", "127.0.0.1", "-p", String(WEB_PORT)],
    {
      cwd: FRONTEND,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(WEB_PORT),
        NEXT_PUBLIC_API_URL: API_URL,
      },
      name: "ui",
    }
  );
  await waitForHttp(`http://127.0.0.1:${WEB_PORT}`);

  const url = `http://127.0.0.1:${WEB_PORT}`;
  logLine(`Khan Engineerings is ready at ${url}`);
  openBrowser(url);

  function shutdown() {
    try {
      frontendProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      backendProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
