const mongoose = require("mongoose");

const claimItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, default: "" },
    disposition: {
      type: String,
      enum: ["reusable", "rework", "scrap_loss", "replacement"],
      required: true,
    },
    weightKg: { type: Number, min: 0, default: null },
  },
  { _id: true }
);

const claimSchema = new mongoose.Schema(
  {
    claimNo: { type: String, required: true, unique: true, trim: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    claimDate: { type: Date, required: true, index: true },
    items: { type: [claimItemSchema], default: [] },
    replacementOrder: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", default: null },
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
