const { Router } = require("express");
const controller = require("./auth.controller");
const { requireAuth, requireRole } = require("../../middleware/auth");

const router = Router();

router.post("/login", controller.login);
router.post("/logout", controller.logout);
router.get("/me", requireAuth, controller.me);
router.patch("/profile", requireAuth, controller.updateProfile);
router.post("/change-password", requireAuth, controller.changePassword);

// Future-ready: admins can create users with roles
router.post("/register", requireAuth, requireRole("admin"), controller.register);

module.exports = router;
