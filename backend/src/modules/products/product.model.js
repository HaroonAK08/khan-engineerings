const mongoose = require("mongoose");
const { PRODUCT_FAMILY_IDS } = require("../domain/mfg.constants");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    unitLabel: { type: String, trim: true, default: "pcs" },
    family: {
      type: String,
      enum: PRODUCT_FAMILY_IDS,
      required: true,
      default: "hub",
      index: true,
    },
    weightKg: { type: Number, min: 0, default: null },
    /** Weighted moving average make-cost; updated when batches finish (Phase B+) */
    standardCost: { type: Number, min: 0, default: 0 },
    /** Price per kg entered by the user; sellingPrice is always derived from weightKg * pricePerKg */
    pricePerKg: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, default: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "ProductCategory", default: null },
    size: { type: mongoose.Schema.Types.ObjectId, ref: "ProductSize", default: null },
    defaultWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", default: null },
    lowStockThreshold: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ name: 1 });

module.exports = mongoose.model("Product", productSchema);
