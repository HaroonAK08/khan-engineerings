const { Router } = require("express");
const controller = require("./customer.controller");
const customerService = require("./customer.service");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);
router.get("/", controller.list);
router.post("/", controller.create);

router.get("/:id/ledger", async (req, res, next) => {
  try {
    const result = await customerService.listLedger(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/adjustments", async (req, res, next) => {
  try {
    const result = await customerService.recordAdjustment(req.params.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/payments", async (req, res, next) => {
  try {
    const result = await customerService.recordPayment(req.params.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", controller.getOne);
router.patch("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
