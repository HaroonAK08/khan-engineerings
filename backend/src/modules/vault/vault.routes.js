const { Router } = require("express");
const controller = require("./vault.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/status", controller.status);
router.post("/setup", controller.setup);
router.post("/unlock", controller.unlock);
router.post("/change-pin", controller.changePin);

router.use(controller.requireVaultUnlock);

router.get("/assets", controller.listAssets);
router.post("/assets", controller.createAsset);
router.patch("/assets/:id", controller.updateAsset);
router.delete("/assets/:id", controller.removeAsset);
router.get("/year-summary", controller.yearSummary);

module.exports = router;
