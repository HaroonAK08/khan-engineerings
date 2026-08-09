const { Router } = require("express");
const controller = require("./finance.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/overview", controller.overview);
router.get("/monthly", controller.monthly);
router.get("/customer-revenue", controller.customerRevenue);
router.get("/supplier-expenses", controller.supplierExpenses);
router.get("/product-profit", controller.productProfit);
router.get("/production-margin", controller.productionMargin);
router.get("/party-sales-margin", controller.partySalesMargin);
router.get("/charges-calculator", controller.chargesCalculator);
router.post("/charges-calculator/preview", controller.chargesCalculatorPreview);
router.get("/manufacturing", controller.manufacturing);
router.get("/expense-breakdown", controller.expenses);

router.get("/entries", controller.listEntries);
router.post("/entries", controller.createEntry);
router.delete("/entries/:id", controller.removeEntry);

module.exports = router;
