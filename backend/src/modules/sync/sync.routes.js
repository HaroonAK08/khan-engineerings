const { Router } = require("express");
const controller = require("./sync.controller");
const { createHash, timingSafeEqual } = require("crypto");
const digest = (value) => createHash("sha256").update(value).digest();

const router = Router();
router.use((req, res, next) => {
  const token = process.env.DESKTOP_BACKUP_TOKEN;
  const device = process.env.DESKTOP_BACKUP_DEVICE;
  if (!/^[a-f0-9]{64}$/.test(token || "") || !device) return res.sendStatus(503);
  if (req.get("x-desktop-device") !== device ||
      !timingSafeEqual(digest(req.get("authorization") || ""), digest(`Bearer ${token}`))) return res.sendStatus(401);
  req.user = { sub: "000000000000000000000001" };
  res.set("Cache-Control", "no-store");
  next();
});
router.post("/uploads", controller.begin);
router.put("/uploads/:uploadId/chunks/:index", controller.chunk);
router.post("/uploads/:uploadId/complete", controller.complete);
router.get("/latest", controller.latest);
router.get("/uploads/:uploadId/chunks/:index", controller.download);

module.exports = router;
