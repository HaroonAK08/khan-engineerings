const mongoose = require("mongoose");
const { STOCK_ITEM_TYPE_IDS, STOCK_REASONS } = require("../domain/mfg.constants");

/**
 * Stock movement ledger.
 * quantity is always positive; direction is in|out.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    itemType: { type: String, enum: STOCK_ITEM_TYPE_IDS, required: true, index: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    reason: {
      type: String,
      enum: STOCK_REASONS,
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "kg" },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null, index: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", default: null, index: true },
    refType: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    movementDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

stockMovementSchema.index({ itemType: 1, product: 1, warehouse: 1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
