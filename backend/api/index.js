try {
  require("dotenv").config();
} catch (_) {
  /* env comes from Vercel */
}

const serverless = require("serverless-http");
const app = require("../src/app");
const { connectDB } = require("../src/config/db");

const handler = serverless(app);

function setCors(res) {
  const origin = process.env.CORS_ORIGIN || "http://localhost:3000";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async (req, res) => {
  try {
    // Preflight must not require Mongo — otherwise browser only shows "provisional headers"
    if (req.method === "OPTIONS") {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    await connectDB();
    return handler(req, res);
  } catch (err) {
    console.error("API handler error:", err);
    if (!res.headersSent) {
      setCors(res);
      res.status(500).json({
        message: err.message || "Server error",
        name: err.name,
      });
    }
  }
};
