const mongoose = require("mongoose");

const assetCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assetCategorySchema.index({ name: 1 }, { unique: true });

const assetItemSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssetCategory",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    price: { type: Number, min: 0, default: 0 },
    quantity: { type: Number, min: 0, default: 1 },
    details: { type: String, trim: true, default: "" },
    purchaseDate: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assetItemSchema.index({ category: 1, name: 1 });

module.exports = {
  AssetCategory: mongoose.model("AssetCategory", assetCategorySchema),
  AssetItem: mongoose.model("AssetItem", assetItemSchema),
};
