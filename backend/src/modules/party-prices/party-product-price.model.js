const mongoose = require("mongoose");

const partyProductPriceSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    pricingMode: { type: String, enum: ["rate_kg", "fixed"], default: "rate_kg" },
    ratePerKg: { type: Number, min: 0, default: 0 },
    unitPrice: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

partyProductPriceSchema.index({ customer: 1, product: 1 }, { unique: true });

module.exports = mongoose.model("PartyProductPrice", partyProductPriceSchema);
