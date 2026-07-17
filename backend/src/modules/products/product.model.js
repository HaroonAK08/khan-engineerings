const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    unitLabel: { type: String, trim: true, default: "pcs" },
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
