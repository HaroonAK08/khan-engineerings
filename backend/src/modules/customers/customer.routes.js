const { Router } = require("express");
const controller = require("./customer.controller");
const customerService = require("./customer.service");
const partyPriceService = require("../party-prices/party-product-price.service");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);
router.get("/", controller.list);
router.post("/", controller.create);

router.get("/instruments/due", async (req, res, next) => {
  try {
    const instruments = await customerService.listDueInstruments();
    res.json({ instruments });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/ledger", async (req, res, next) => {
  try {
    const result = await customerService.listLedger(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/product-prices", async (req, res, next) => {
  try {
    if (req.query.product) {
      const price = await partyPriceService.getOne(req.params.id, req.query.product);
      return res.json({ price });
    }
    const prices = await partyPriceService.listForCustomer(req.params.id);
    res.json({ prices });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/product-prices/:productId", async (req, res, next) => {
  try {
    const price = await partyPriceService.getOne(req.params.id, req.params.productId);
    res.json({ price });
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

router.get("/:id/instruments", async (req, res, next) => {
  try {
    const instruments = await customerService.listInstruments(req.params.id);
    res.json({ instruments });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/instruments", async (req, res, next) => {
  try {
    const instrument = await customerService.createInstrument(req.params.id, req.body);
    res.status(201).json({ instrument });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/instruments/:instrumentId", async (req, res, next) => {
  try {
    const instrument = await customerService.updateInstrument(
      req.params.id,
      req.params.instrumentId,
      req.body
    );
    res.json({ instrument });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/instruments/:instrumentId/receive", async (req, res, next) => {
  try {
    const result = await customerService.receiveInstrument(
      req.params.id,
      req.params.instrumentId,
      req.body
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/instruments/:instrumentId", async (req, res, next) => {
  try {
    const result = await customerService.removeInstrument(
      req.params.id,
      req.params.instrumentId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/ledger/:entryId", async (req, res, next) => {
  try {
    const result = await customerService.updateLedgerEntry(
      req.params.id,
      req.params.entryId,
      req.body
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/ledger/:entryId", async (req, res, next) => {
  try {
    const result = await customerService.removeLedgerEntry(
      req.params.id,
      req.params.entryId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", controller.getOne);
router.patch("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
