try {
  require("dotenv").config();
} catch (_) {
  /* env comes from Vercel */
}

const serverless = require("serverless-http");
const app = require("../src/app");
const { connectDB } = require("../src/config/db");

const handler = serverless(app);

module.exports = async (req, res) => {
  try {
    await connectDB();
    return handler(req, res);
  } catch (err) {
    console.error("API handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        message: err.message || "Server error",
        name: err.name,
      });
    }
  }
};
