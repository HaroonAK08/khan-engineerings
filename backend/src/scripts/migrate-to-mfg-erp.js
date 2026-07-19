/**
 * Phase A migration: Manufacturing ERP domain foundation.
 *
 * - Purchases: materialType, freightAmount, amountPaid, balance; drop legacy `material`
 * - Products: family, weightKg, standardCost, sellingPrice
 * - BatchExpenses: map legacy stages/categories to new taxonomy
 * - Stock movements: leave as-is (new types used going forward)
 *
 * Production batch reshape is Phase B — not done here.
 *
 * Usage: npm run migrate:mfg
 * Idempotent via migratedPhaseAAt flag where applicable.
 */
require("dotenv").config();
const { connectDB } = require("../config/db");
const mongoose = require("mongoose");
const {
  LEGACY_STAGE_MAP,
  LEGACY_CATEGORY_MAP,
  PRODUCT_FAMILY_IDS,
} = require("../modules/domain/mfg.constants");

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function inferFamily(product) {
  const hay = `${product.name || ""} ${product.sku || ""} ${product.description || ""}`.toLowerCase();
  if (/\bdrum\b|daig/.test(hay)) return "drum";
  if (/\bhub\b/.test(hay)) return "hub";
  // Category name if populated
  const catName = typeof product.category === "object" ? product.category?.name || "" : "";
  if (/drum/i.test(catName)) return "drum";
  if (/hub/i.test(catName)) return "hub";
  return "hub";
}

async function migratePurchases() {
  const col = mongoose.connection.collection("purchases");
  const cursor = col.find({});
  let updated = 0;
  let skipped = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (doc.migratedPhaseAAt && doc.materialType) {
      skipped += 1;
      continue;
    }

    const materialType =
      doc.materialType === "daig" || doc.material === "daig" ? "daig" : "scrap";
    const totalAmount = Number(doc.totalAmount) || 0;
    const freightAmount = Number(doc.freightAmount) || 0;
    const amountPaid = Number(doc.amountPaid) || 0;
    const payable = roundMoney(totalAmount + freightAmount);
    const balance = roundMoney(Math.max(0, payable - amountPaid));

    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          materialType,
          freightAmount,
          amountPaid,
          balance,
          vehicleNo: doc.vehicleNo || "",
          migratedPhaseAAt: new Date(),
        },
        $unset: { material: "" },
      }
    );
    updated += 1;
  }

  return { updated, skipped };
}

async function migrateProducts() {
  const Product = require("../modules/products/product.model");
  const products = await Product.find({}).populate("category", "name");
  let updated = 0;
  let skipped = 0;
  const needsReview = [];

  for (const product of products) {
    const raw = product.toObject();
    if (raw.migratedPhaseAAt && PRODUCT_FAMILY_IDS.includes(raw.family)) {
      skipped += 1;
      continue;
    }

    const family = PRODUCT_FAMILY_IDS.includes(raw.family) ? raw.family : inferFamily(raw);
    const inferred = !PRODUCT_FAMILY_IDS.includes(raw.family);
    if (inferred) needsReview.push({ id: String(product._id), name: product.name, family });

    await mongoose.connection.collection("products").updateOne(
      { _id: product._id },
      {
        $set: {
          family,
          weightKg: raw.weightKg ?? null,
          standardCost: Number(raw.standardCost) || 0,
          sellingPrice: Number(raw.sellingPrice) || 0,
          migratedPhaseAAt: new Date(),
        },
      }
    );
    updated += 1;
  }

  return { updated, skipped, needsReview };
}

async function migrateExpenses() {
  const col = mongoose.connection.collection("batchexpenses");
  const cursor = col.find({});
  let updated = 0;
  let skipped = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (doc.migratedPhaseAAt) {
      skipped += 1;
      continue;
    }

    const stage = LEGACY_STAGE_MAP[doc.stage] || doc.stage;
    const category = LEGACY_CATEGORY_MAP[doc.category] || doc.category;

    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          stage,
          category,
          migratedPhaseAAt: new Date(),
        },
      }
    );
    updated += 1;
  }

  return { updated, skipped };
}

async function alignPurchaseLedgerPayables() {
  /** Ensure purchase ledger amount = totalAmount + freight for migrated purchases */
  const purchases = await mongoose.connection.collection("purchases").find({}).toArray();
  let updated = 0;
  for (const p of purchases) {
    const payable = roundMoney((Number(p.totalAmount) || 0) + (Number(p.freightAmount) || 0));
    const result = await mongoose.connection.collection("ledgerentries").updateOne(
      { purchase: p._id, type: "purchase" },
      { $set: { amount: payable } }
    );
    if (result.modifiedCount) updated += 1;
  }
  return { updated };
}

async function main() {
  await connectDB();
  console.log("Phase A migration starting…");

  const purchases = await migratePurchases();
  console.log(`Purchases: updated=${purchases.updated} skipped=${purchases.skipped}`);

  const products = await migrateProducts();
  console.log(`Products: updated=${products.updated} skipped=${products.skipped}`);
  if (products.needsReview.length) {
    console.log("Products family inferred (review if needed):");
    for (const row of products.needsReview.slice(0, 30)) {
      console.log(`  - ${row.name} → ${row.family} (${row.id})`);
    }
    if (products.needsReview.length > 30) {
      console.log(`  …and ${products.needsReview.length - 30} more`);
    }
  }

  const expenses = await migrateExpenses();
  console.log(`Expenses: updated=${expenses.updated} skipped=${expenses.skipped}`);

  const ledger = await alignPurchaseLedgerPayables();
  console.log(`Purchase ledger payables aligned: ${ledger.updated}`);

  console.log("Phase A migration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
