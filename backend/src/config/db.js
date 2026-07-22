const mongoose = require("mongoose");

let cached = global.__mongoose;
if (!cached) {
  cached = global.__mongoose = { conn: null, promise: null };
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set on this server (check Vercel Environment Variables)");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        // Vercel serverless: IPv6 DNS can hang; force IPv4
        family: 4,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        maxPoolSize: 5,
        minPoolSize: 0,
        bufferCommands: false,
      })
      .then((m) => {
        console.log("MongoDB connected");
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        const hint =
          "Check Vercel env MONGODB_URI matches Atlas (no quotes). IP Access List should include 0.0.0.0/0.";
        const wrapped = new Error(`${err.message} | ${hint}`);
        wrapped.name = err.name;
        throw wrapped;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { connectDB };
