const { Router } = require("express");
const controller = require("./ledger.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.get("/", controller.list);
router.post("/payments", controller.payment);
router.post("/adjustments", controller.adjustment);

module.exports = router;
