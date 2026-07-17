const authService = require("./auth.service");

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function toPublicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

async function register(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);
    res.cookie("token", token, COOKIE_OPTIONS);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    res.cookie("token", token, COOKIE_OPTIONS);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie("token", COOKIE_OPTIONS);
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
