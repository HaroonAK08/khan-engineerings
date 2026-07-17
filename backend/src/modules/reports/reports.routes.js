const { Router } = require("express");
const controller = require("./reports.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/search", controller.search);

router.get("/statements/customers/:id", controller.customerStatement);
router.get("/statements/suppliers/:id", controller.supplierStatement);

router.get("/export/sales", controller.exportSales);
router.get("/export/purchases", controller.exportPurchases);
router.get("/export/production", controller.exportProduction);
router.get("/export/expenses", controller.exportExpenses);
router.get("/export/inventory", controller.exportInventory);
router.get("/export/finance", controller.exportFinance);
router.get("/export/statements/customers/:id", controller.exportCustomerStatement);
router.get("/export/statements/suppliers/:id", controller.exportSupplierStatement);

module.exports = router;
