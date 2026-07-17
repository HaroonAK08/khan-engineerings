const { Router } = require("express");
const controller = require("./order.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/reports", controller.report);
router.get("/payments", controller.payments);
router.get("/dispatches", controller.dispatches);

router.get("/", controller.list);
router.post("/", controller.create);

router.post("/:id/payments", controller.pay);
router.post("/:id/dispatch", controller.dispatch);
router.post("/:id/cancel", controller.cancel);

router.get("/:id", controller.getOne);

module.exports = router;
