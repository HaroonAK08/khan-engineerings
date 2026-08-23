require("dotenv").config();
const { connectDB } = require("../config/db");
const inventoryService = require("../modules/inventory/inventory.service");

async function main() {
  await connectDB();
  const result = await inventoryService.rebuildFinishedGoodsLedger();
  console.log("Finished goods ledger rebuilt");
  console.log(result);
  process.exit(0);
}

main().catch((err) => {
  console.error("Rebuild failed:", err.message);
  process.exit(1);
});
