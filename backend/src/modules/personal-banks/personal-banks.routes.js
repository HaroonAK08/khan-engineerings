const { Router } = require("express");
const controller = require("./personal-banks.controller");
const { requirePersonalBanks } = require("./personal-banks.auth");

const router = Router();

router.get("/auth/status", controller.status);
router.post("/auth/setup", controller.setup);
router.post("/auth/unlock", controller.unlock);
router.post("/auth/change-pin", requirePersonalBanks, controller.changePin);
router.post("/auth/reset-pin", controller.resetPin);

router.use(requirePersonalBanks);

router.get("/summary", controller.summary);

router.get("/banks", controller.listBanks);
router.post("/banks", controller.createBank);
router.patch("/banks/:id", controller.updateBank);
router.delete("/banks/:id", controller.removeBank);

router.get("/accounts", controller.listAccounts);
router.post("/accounts", controller.createAccount);
router.patch("/accounts/:id", controller.updateAccount);
router.delete("/accounts/:id", controller.removeAccount);

router.post("/deposit", controller.deposit);
router.post("/send", controller.send);
router.get("/transactions", controller.listTransactions);
router.patch("/transactions/:id", controller.updateTransaction);
router.delete("/transactions/:id", controller.removeTransaction);
router.get("/people", controller.listPeople);
router.patch("/people", controller.renamePerson);
router.delete("/people", controller.removePerson);

module.exports = router;
