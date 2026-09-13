const jwt = require("jsonwebtoken");

const PERSONAL_BANKS_TYP = "personal_banks";

function requirePersonalBanks(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unlock personal banks first" });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.typ !== PERSONAL_BANKS_TYP) {
      return res.status(401).json({ message: "Invalid personal banks token" });
    }
    req.personalBanks = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Personal banks session expired" });
  }
}

function signPersonalBanksToken() {
  return jwt.sign({ typ: PERSONAL_BANKS_TYP }, process.env.JWT_SECRET, {
    expiresIn: "12h",
  });
}

module.exports = {
  requirePersonalBanks,
  signPersonalBanksToken,
  PERSONAL_BANKS_TYP,
};
