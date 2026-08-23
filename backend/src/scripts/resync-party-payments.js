require("dotenv").config();
const { connectDB } = require("../config/db");
const builtyService = require("../modules/builty/builty.service");
const ledgerService = require("../modules/ledger/ledger.service");

async function main() {
  await connectDB();
  const customers = await builtyService.resyncAllCustomerPaymentStatuses();
  const suppliers = await ledgerService.resyncAllSupplierPurchaseBalances();
  console.log(`Resynced this-month-first payments for ${customers} parties and ${suppliers} suppliers`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Resync failed:", err.message);
  process.exit(1);
});
