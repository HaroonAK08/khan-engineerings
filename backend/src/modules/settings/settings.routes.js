const { Router } = require("express");
const controller = require("./settings.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/payroll-periods", controller.listPayrollPeriods);
router.get("/payroll-periods/:month", controller.getPayrollPeriod);
router.put("/payroll-periods/:month", controller.upsertPayrollPeriod);
router.delete("/payroll-periods/:month", controller.deletePayrollPeriod);

module.exports = router;
