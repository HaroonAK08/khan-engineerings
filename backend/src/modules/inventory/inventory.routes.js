const { Router } = require("express");
const controller = require("./inventory.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.use(requireAuth);

router.get("/overview", controller.overview);
router.get("/stock", controller.stock);
router.get("/finished", controller.finished);
router.get("/alerts", controller.alerts);
router.get("/movements", controller.movements);
router.post("/movements", controller.adjust);
router.get("/reports", controller.report);
router.post("/sync", controller.syncHistory);

router.get("/categories", controller.listCategories);
router.post("/categories", controller.createCategory);
router.patch("/categories/:id", controller.updateCategory);
router.delete("/categories/:id", controller.removeCategory);

router.get("/sizes", controller.listSizes);
router.post("/sizes", controller.createSize);
router.patch("/sizes/:id", controller.updateSize);
router.delete("/sizes/:id", controller.removeSize);

router.get("/warehouses", controller.listWarehouses);
router.post("/warehouses", controller.createWarehouse);
router.patch("/warehouses/:id", controller.updateWarehouse);
router.delete("/warehouses/:id", controller.removeWarehouse);

module.exports = router;
