if (!process.env.VERCEL) {
  try {
    require("dotenv").config();
  } catch (_) {
    /* local only */
  }
}

function setCors(res) {
  const origin = process.env.CORS_ORIGIN || "http://localhost:3000";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function requestPath(req) {
  const raw =
    req.url ||
    req.path ||
    (req.headers && (req.headers["x-invoke-path"] || req.headers["x-forwarded-uri"])) ||
    "";
  try {
    return decodeURIComponent(String(raw).split("?")[0] || "");
  } catch {
    return String(raw).split("?")[0] || "";
  }
}

function isHealthRequest(req) {
  return requestPath(req).toLowerCase().includes("health");
}

function isDbCheckRequest(req) {
  return requestPath(req).toLowerCase().includes("db-check");
}

function normalizeVercelBody(req) {
  if (!process.env.VERCEL) return;
  try {
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString("utf8");
      req.body = raw ? JSON.parse(raw) : {};
    } else if (typeof req.body === "string") {
      req.body = req.body ? JSON.parse(req.body) : {};
    } else if (req.body == null) {
      req.body = {};
    }
  } catch {
    req.body = {};
  }
}

function runExpress(app, req, res) {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      res.off("finish", done);
      res.off("close", done);
      res.off("error", fail);
    };

    res.on("finish", done);
    res.on("close", done);
    res.on("error", fail);

    try {
      app(req, res);
    } catch (err) {
      fail(err);
    }
  });
}

let app;

function getApp() {
  if (!app) app = require("../src/app");
  return app;
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (isHealthRequest(req)) {
      setCors(res);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "ok",
          path: requestPath(req),
          hasMongoUri: Boolean(process.env.MONGODB_URI),
          corsOrigin: process.env.CORS_ORIGIN || null,
          vercel: Boolean(process.env.VERCEL),
        })
      );
      return;
    }

    const { connectDB } = require("../src/config/db");

    if (isDbCheckRequest(req)) {
      const started = Date.now();
      try {
        await connectDB();
        setCors(res);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "db-ok", ms: Date.now() - started }));
      } catch (err) {
        setCors(res);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            status: "db-fail",
            ms: Date.now() - started,
            message: err.message,
            name: err.name,
          })
        );
      }
      return;
    }

    normalizeVercelBody(req);
    await connectDB();
    await runExpress(getApp(), req, res);
  } catch (err) {
    console.error("API handler error:", err);
    if (!res.headersSent) {
      setCors(res);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: err.message || "Server error",
          name: err.name,
        })
      );
    }
  }
};
