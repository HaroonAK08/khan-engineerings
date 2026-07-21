const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./auth.model");

const TOKEN_TTL = "7d";
const ALLOWED_ROLES = ["admin", "manager", "staff"];

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function assertEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    const err = new Error("A valid email is required");
    err.statusCode = 400;
    throw err;
  }
}

function assertPassword(password, label = "Password") {
  if (!password || typeof password !== "string" || password.length < 6) {
    const err = new Error(`${label} must be at least 6 characters`);
    err.statusCode = 400;
    throw err;
  }
}

async function register({ name, email, password, role = "staff" }) {
  if (!name || typeof name !== "string" || !name.trim()) {
    const err = new Error("Name is required");
    err.statusCode = 400;
    throw err;
  }
  assertEmail(email);
  assertPassword(password);

  const normalizedRole = ALLOWED_ROLES.includes(role) ? role : "staff";

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    const err = new Error("Email already in use");
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role: normalizedRole,
  });
  return { user, token: signToken(user) };
}

async function login(body) {
  // Simple 4-digit unlock for factory floor (restore email login below later)
  const USE_PIN_LOGIN = true;
  const APP_PIN = process.env.APP_PIN || "3811";

  if (USE_PIN_LOGIN) {
    const pin = String(body.pin ?? body.password ?? "").trim();
    if (!/^\d{4}$/.test(pin) || pin !== APP_PIN) {
      const err = new Error("Wrong code");
      err.statusCode = 401;
      throw err;
    }
    let user = await User.findOne({ role: "admin" });
    if (!user) user = await User.findOne();
    if (!user) {
      const err = new Error("No user found — run seed admin first");
      err.statusCode = 500;
      throw err;
    }
    return { user, token: signToken(user) };
  }

  /* --- Email/password login (restore later: set USE_PIN_LOGIN = false) ---
  const { email, password } = body;
  assertEmail(email);
  if (!password) {
    const err = new Error("Password is required");
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const err = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }
  return { user, token: signToken(user) };
  --- */
}

async function getById(userId) {
  const user = await User.findById(userId).select("-passwordHash");
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  return user;
}

async function updateProfile(userId, { name, email }) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  if (name !== undefined) {
    if (!name || typeof name !== "string" || !name.trim()) {
      const err = new Error("Name is required");
      err.statusCode = 400;
      throw err;
    }
    user.name = name.trim();
  }

  if (email !== undefined) {
    assertEmail(email);
    const normalized = email.toLowerCase().trim();
    if (normalized !== user.email) {
      const taken = await User.findOne({ email: normalized, _id: { $ne: userId } });
      if (taken) {
        const err = new Error("Email already in use");
        err.statusCode = 409;
        throw err;
      }
      user.email = normalized;
    }
  }

  await user.save();
  return user;
}

async function changePassword(userId, { currentPassword, newPassword }) {
  if (!currentPassword) {
    const err = new Error("Current password is required");
    err.statusCode = 400;
    throw err;
  }
  assertPassword(newPassword, "New password");

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    const err = new Error("Current password is incorrect");
    err.statusCode = 401;
    throw err;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  return user;
}

module.exports = { register, login, getById, updateProfile, changePassword };
