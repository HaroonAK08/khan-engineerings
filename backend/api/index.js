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
  const path = requestPath(req).toLowerCase();
  return path.includes("health");
}

let cachedHandler;

async function getAppHandler() {
  if (cachedHandler) return cachedHandler;
  const serverless = require("serverless-http");
  const app = require("../src/app");
  cachedHandler = serverless(app);
  return cachedHandler;
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    // Never load Express/Mongoose for health — proves the Vercel function is alive
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
    await connectDB();
    const handler = await getAppHandler();
    return handler(req, res);
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
