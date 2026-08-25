const { Router } = require("express");
const controller = require("./settings.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/waste-percent", controller.getWasteSettings);
router.put("/waste-percent", controller.setWastePercent);

router.get("/tax-split", controller.getTaxSplit);
router.put("/tax-split", controller.setTaxSplit);

router.get("/payroll-periods", controller.listPayrollPeriods);
router.get("/payroll-periods/:month", controller.getPayrollPeriod);
router.put("/payroll-periods/:month", controller.upsertPayrollPeriod);
router.delete("/payroll-periods/:month", controller.deletePayrollPeriod);

module.exports = router;
