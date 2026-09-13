const mongoose = require("mongoose");

const assetCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssetCategory",
      default: null,
      index: true,
    },
    notes: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Same name allowed under different parents; unique among siblings (incl. top-level).
assetCategorySchema.index(
  { parent: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
  }
);

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

const AssetCategory = mongoose.model("AssetCategory", assetCategorySchema);
const AssetItem = mongoose.model("AssetItem", assetItemSchema);

// Drop legacy unique-on-name index if present (replaced by parent+name).
function dropLegacyNameIndex() {
  AssetCategory.collection.dropIndex("name_1").catch(() => {});
}
if (mongoose.connection.readyState === 1) dropLegacyNameIndex();
else mongoose.connection.once("connected", dropLegacyNameIndex);

module.exports = {
  AssetCategory,
  AssetItem,
};
