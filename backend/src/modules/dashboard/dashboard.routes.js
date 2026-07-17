const { Router } = require("express");
const controller = require("./dashboard.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);
router.get("/", controller.overview);

module.exports = router;
