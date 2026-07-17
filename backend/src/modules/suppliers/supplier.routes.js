const { Router } = require("express");
const controller = require("./supplier.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getOne);
router.patch("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
