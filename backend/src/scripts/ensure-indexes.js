#!/usr/bin/env node
/**
 * Create the performance indexes identified in docs/audit/04-database-performance.md.
 *
 * Idempotent: `createIndex` on an existing identical index is a no-op.
 * Read-only with respect to documents — it never touches data.
 *
 *   node src/scripts/ensure-indexes.js            # report what is missing
 *   node src/scripts/ensure-indexes.js --apply    # create them
 *   node src/scripts/ensure-indexes.js --apply --drop-stale
 *
 * Index builds on a live Atlas cluster are backgrounded by default, but run
 * this during a quiet period anyway.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");

/**
 * Each entry records WHY the index exists so a future reader can judge whether
 * it still earns its keep.
 */
const INDEXES = [
  {
    collection: "builties",
    keys: { customer: 1, builtyDate: 1 },
    name: "customer_1_builtyDate_1",
    reason:
      "syncCustomerBuiltyPaymentStatuses and every party statement load one customer's builties ordered by date.",
  },
  {
    collection: "builties",
    keys: { "items.product": 1 },
    name: "items.product_1",
    reason:
      "avgSoldPrices, the production report sales join and party margin all match on a product inside items[].",
  },
  {
    collection: "stockmovements",
    keys: { itemType: 1, movementDate: 1 },
    name: "itemType_1_movementDate_1",
    reason:
      "Every as-of stock balance filters on itemType within a date range; only one of the two single-field indexes could be used.",
  },
  {
    collection: "stockmovements",
    keys: { refType: 1, refId: 1 },
    name: "refType_1_refId_1",
    reason:
      "deleteMovementsByRef runs on every purchase/production/builty edit and delete.",
  },
  {
    collection: "productionbatches",
    keys: { status: 1, productionDate: 1 },
    name: "status_1_productionDate_1",
    reason:
      "Every production and finance report filters status != cancelled within a date window.",
  },
  {
    collection: "customerledgerentries",
    keys: { customer: 1, entryDate: 1 },
    name: "customer_1_entryDate_1",
    reason: "Party ledger and balance reads scan one customer in date order.",
  },
  {
    collection: "ledgerentries",
    keys: { supplier: 1, entryDate: 1 },
    name: "supplier_1_entryDate_1",
    reason: "Supplier ledger and syncSupplierPurchaseBalances, same shape as above.",
  },
  {
    collection: "customerpayments",
    keys: { customer: 1, paymentDate: 1 },
    name: "customer_1_paymentDate_1",
    reason: "Payment allocation loads one customer's payments in date order.",
  },
];

/** Indexes for fields that no longer exist on the schema. */
const STALE = [{ collection: "customerpayments", name: "order_1", reason: "`order` was removed from the schema." }];

async function main() {
  const apply = process.argv.includes("--apply");
  const dropStale = process.argv.includes("--drop-stale");

  await connectDB();
  const db = mongoose.connection.db;
  console.log(`database: ${db.databaseName}`);
  console.log(apply ? "mode: APPLY\n" : "mode: DRY RUN (pass --apply to create)\n");

  let created = 0;
  let present = 0;

  for (const spec of INDEXES) {
    const collection = db.collection(spec.collection);
    const existing = await collection.indexes().catch(() => []);
    const match = existing.find(
      (i) => JSON.stringify(i.key) === JSON.stringify(spec.keys)
    );
    if (match) {
      present += 1;
      console.log(`  = ${spec.collection}.${match.name} (already present)`);
      continue;
    }
    if (!apply) {
      console.log(`  + ${spec.collection}.${spec.name} WOULD BE CREATED`);
      console.log(`      ${spec.reason}`);
      continue;
    }
    await collection.createIndex(spec.keys, { name: spec.name, background: true });
    created += 1;
    console.log(`  + ${spec.collection}.${spec.name} created`);
    console.log(`      ${spec.reason}`);
  }

  for (const spec of STALE) {
    const collection = db.collection(spec.collection);
    const existing = await collection.indexes().catch(() => []);
    if (!existing.some((i) => i.name === spec.name)) continue;
    if (!dropStale) {
      console.log(`  ! ${spec.collection}.${spec.name} is stale — ${spec.reason}`);
      console.log("      pass --drop-stale to remove it");
      continue;
    }
    await collection.dropIndex(spec.name);
    console.log(`  - ${spec.collection}.${spec.name} dropped (${spec.reason})`);
  }

  console.log(`\n${present} already present, ${created} created.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("ensure-indexes failed:", err.message);
  process.exit(1);
});
