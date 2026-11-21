const mongoose = require("mongoose");
require("dotenv").config();
const { connectDB } = require("../config/db");
const Product = require("../modules/products/product.model");

async function main() {
  await connectDB();
  const cursor = Product.find({}).cursor();
  let updated = 0;
  for await (const product of cursor) {
    const expected = product.family === "drum" ? "daig" : "scrap";
    if (product.family === "other" && !["scrap", "daig"].includes(product.materialType)) {
      console.warn(`Other product needs materialType: ${product._id} ${product.name}`);
      continue;
    }
    if (product.materialType !== expected && product.family !== "other") {
      product.materialType = expected;
      await product.save();
      updated += 1;
    }
  }
  console.log(`Updated ${updated} product material sources.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
