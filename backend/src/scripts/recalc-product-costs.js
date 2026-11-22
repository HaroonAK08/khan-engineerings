/**
 * Rebuilds rawMaterialCost / otherCost / standardCost on every product.
 *
 * standardCost used to be derived from expenses linked to a production batch.
 * Those are always empty in practice (all expenses are factory overhead with
 * batch: null), so stored costs contain metal only and understate the real
 * make-cost by roughly half. This recomputes them from the shared resolver.
 *
 * Run with --dry-run to preview without writing.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Product = require("../modules/products/product.model");
const { getCostRates, costForProduct, applyProductCost } = require("../modules/products/product-cost");

function money(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await connectDB();

  const rates = await getCostRates({ force: true });
  console.log("material rates:", rates.material);
  console.log("overhead per kg:", rates.overhead);
  console.log("");

  const products = await Product.find({});
  let changed = 0;
  let skipped = 0;

  for (const product of products) {
    const next = costForProduct(product, rates);
    if (!next) {
      skipped += 1;
      continue;
    }
    const before = Number(product.standardCost) || 0;
    if (Math.abs(before - next.standardCost) <= 0.009) continue;

    console.log(
      `${product.name}: ${money(before)} -> ${money(next.standardCost)} ` +
        `(raw ${money(next.rawMaterialCost)} + other ${money(next.otherCost)})`
    );
    changed += 1;
    if (!dryRun) await applyProductCost(product, rates);
  }

  console.log("");
  console.log(
    `${dryRun ? "Would update" : "Updated"} ${changed} product(s).` +
      (skipped ? ` Skipped ${skipped} with no weight.` : "")
  );
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
