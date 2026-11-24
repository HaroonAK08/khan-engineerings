const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { FRONTEND, API_PORT, API_URL } = require("./env.cjs");

const markerPath = path.join(FRONTEND, ".next-desktop", "desktop-api-url");
const buildId = path.join(FRONTEND, ".next-desktop", "BUILD_ID");
const alreadyBuilt =
  fs.existsSync(buildId) &&
  fs.existsSync(markerPath) &&
  fs.readFileSync(markerPath, "utf8").trim() === API_URL;

if (alreadyBuilt) {
  process.exit(0);
}

console.log("Building the desktop UI…");
const result = spawnSync("npm", ["run", "build"], {
  cwd: FRONTEND,
  env: {
    ...process.env,
    BACKEND_URL: `http://127.0.0.1:${API_PORT}`,
    KE_DESKTOP_BUILD: "1",
    NEXT_PUBLIC_API_URL: API_URL,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

fs.mkdirSync(path.join(FRONTEND, ".next-desktop"), { recursive: true });
fs.writeFileSync(markerPath, API_URL);
