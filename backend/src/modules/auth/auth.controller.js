const authService = require("./auth.service");

function cookieOptions() {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };

  // Shared parent domain (e.g. .haroonahmadkhan.dev)
  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
    return options;
  }

  // Separate Vercel hosts (web.vercel.app → api.vercel.app) need cross-site cookies
  if (process.env.NODE_ENV === "production") {
    options.sameSite = "none";
    options.secure = true;
  }

  return options;
}

function toPublicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

async function register(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);
    res.cookie("token", token, cookieOptions());
    res.status(201).json({ user: toPublicUser(user), token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    res.cookie("token", token, cookieOptions());
    res.json({ user: toPublicUser(user), token });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie("token", cookieOptions());
  res.status(204).send();
}

async function me(req, res, next) {
  try {
    const user = await authService.getById(req.user.sub);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const user = await authService.updateProfile(req.user.sub, req.body);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    await authService.changePassword(req.user.sub, req.body);
    res.json({ message: "Password updated" });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, me, updateProfile, changePassword };
