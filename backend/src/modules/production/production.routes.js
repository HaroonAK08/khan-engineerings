const { Router } = require("express");
const controller = require("./production.controller");
const expenseController = require("../expenses/expense.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/meta", expenseController.meta);
router.get("/cost-reports", expenseController.costReport);
router.get("/reports", controller.report);

router.get("/", controller.list);
router.post("/", controller.create);

router.get("/:id/expenses", expenseController.list);
router.post("/:id/expenses", expenseController.create);
router.patch("/:id/expenses/:expenseId", expenseController.update);
router.delete("/:id/expenses/:expenseId", expenseController.remove);
router.get("/:id/costs", expenseController.costs);

router.get("/:id", controller.getOne);
router.patch("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
