require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Product = require("../modules/products/product.model");
const { syncHistoricalFamily } = require("../modules/products/product.service");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await connectDB();
  const products = await Product.find({}).select("_id name family").lean();
  let batches = 0;
  let outputs = 0;
  for (const product of products) {
    if (dryRun) {
      console.log(`[dry-run] ${product.name}: ${product.family}`);
      continue;
    }
    const result = await syncHistoricalFamily(product._id, product.family);
    batches += result.batches;
    outputs += result.outputs;
  }
  console.log(`${dryRun ? "Would repair" : "Repaired"} ${outputs} output snapshots across ${batches} batches.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
