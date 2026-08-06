const mongoose = require("mongoose");

const claimItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, default: "" },
    disposition: {
      type: String,
      enum: ["returned", "rework", "scrap_loss", "replacement", "reusable"],
      required: true,
    },
    weightKg: { type: Number, min: 0, default: null },
    unitPrice: { type: Number, min: 0, default: null },
    refundAmount: { type: Number, min: 0, default: 0 },
  },
  { _id: true }
);

const claimSchema = new mongoose.Schema(
  {
    claimNo: { type: String, required: true, unique: true, trim: true },
    builty: { type: mongoose.Schema.Types.ObjectId, ref: "Builty", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    claimDate: { type: Date, required: true, index: true },
    items: { type: [claimItemSchema], default: [] },
    refundAmount: { type: Number, min: 0, default: 0 },
    replacementBuilty: { type: mongoose.Schema.Types.ObjectId, ref: "Builty", default: null },
    reworkBatch: { type: mongoose.Schema.Types.ObjectId, ref: "ProductionBatch", default: null },
    notes: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["open", "resolved", "cancelled"],
      default: "open",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Claim", claimSchema);
