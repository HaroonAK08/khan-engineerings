const mongoose = require("mongoose");

let cached = global.__mongoose;
if (!cached) {
  cached = global.__mongoose = { conn: null, promise: null };
}

const HARD_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${ms}ms | Check MONGODB_URI on Vercel and Atlas Network Access (0.0.0.0/0).`
        )
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set on this server (check Vercel Environment Variables)");
  }

  if (/localhost|127\.0\.0\.1/.test(uri)) {
    throw new Error(
      "MONGODB_URI points to localhost — Vercel cannot reach your PC. Use the Atlas mongodb+srv:// URI."
    );
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = withTimeout(
      mongoose.connect(uri, {
        family: 4,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        maxPoolSize: 5,
        minPoolSize: 0,
        bufferCommands: false,
      }),
      HARD_TIMEOUT_MS,
      "MongoDB connect"
    )
      .then((m) => {
        console.log("MongoDB connected");
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        const hint =
          "Check Vercel env MONGODB_URI (Atlas srv, no quotes). Atlas IP list must include 0.0.0.0/0.";
        const wrapped = new Error(`${err.message} | ${hint}`);
        wrapped.name = err.name || "MongoConnectError";
        throw wrapped;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { connectDB };
