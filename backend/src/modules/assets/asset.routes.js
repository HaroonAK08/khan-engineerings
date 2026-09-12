const { Router } = require("express");
const controller = require("./asset.controller");
const { requireAuth } = require("../../middleware/auth");

const router = Router();
router.use(requireAuth);

router.get("/summary", controller.summary);
router.get("/categories", controller.listCategories);
router.post("/categories", controller.createCategory);
router.patch("/categories/:id", controller.updateCategory);
router.delete("/categories/:id", controller.removeCategory);

router.get("/items", controller.listItems);
router.post("/items", controller.createItem);
router.patch("/items/:id", controller.updateItem);
router.delete("/items/:id", controller.removeItem);

module.exports = router;
