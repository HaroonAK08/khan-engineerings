const { Router } = require("express");
const controller = require("./reports.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/search", controller.search);

router.get("/receivables", controller.receivables);
router.get("/received", controller.received);
router.get("/paid", controller.paid);
router.get("/payables", controller.payables);

router.get("/statements/customers/:id", controller.customerStatement);
router.get("/statements/suppliers/:id", controller.supplierStatement);
router.get("/statements/groups/:id", controller.groupStatement);
router.get("/statements/customers-overview", controller.customersOverviewStatement);

router.get("/export/sales", controller.exportSales);
router.get("/export/purchases", controller.exportPurchases);
router.get("/export/production", controller.exportProduction);
router.get("/export/expenses", controller.exportExpenses);
router.get("/export/inventory", controller.exportInventory);
router.get("/export/finance", controller.exportFinance);
router.get("/export/receivables", controller.exportReceivables);
router.get("/export/received", controller.exportReceived);
router.get("/export/paid", controller.exportPaid);
router.get("/export/payables", controller.exportPayables);
router.get("/export/statements/customers/:id", controller.exportCustomerStatement);
router.get("/export/statements/suppliers/:id", controller.exportSupplierStatement);
router.get("/export/statements/groups/:id", controller.exportGroupStatement);
router.get("/export/statements/customers-overview", controller.exportCustomersOverviewStatement);
router.get("/export/full", controller.exportFull);
router.get("/export/custom", controller.exportCustom);
router.get("/preview", controller.combinedPreview);

module.exports = router;
