const { Router } = require("express");
const controller = require("./expense.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/meta", controller.meta);
router.get("/", controller.listOverhead);
router.post("/", controller.createOverhead);
router.patch("/:expenseId", controller.update);
router.delete("/:expenseId", controller.remove);

module.exports = router;
