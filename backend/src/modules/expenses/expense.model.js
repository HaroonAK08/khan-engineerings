const mongoose = require("mongoose");
const { STAGE_IDS, CATEGORY_IDS } = require("./expense.constants");

const batchExpenseSchema = new mongoose.Schema(
  {
    /** null = factory overhead (not tied to a batch) */
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionBatch",
      default: null,
      index: true,
    },
    /** null when overhead has no stage */
    stage: { type: String, enum: [...STAGE_IDS, null], default: null, index: true },
    category: { type: String, enum: CATEGORY_IDS, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
    /** Optional purchase qty for paint/tools/etc. (factory overhead) */
    quantity: { type: Number, min: 0, default: null },
    /** Unit for quantity — kg, pcs, L, etc. */
    quantityUnit: { type: String, trim: true, default: "kg" },
    /** When salary was paid to a named worker */
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      default: null,
      index: true,
    },
    /** Pieces paid for per_unit wages */
    units: { type: Number, default: null },
    payType: {
      type: String,
      enum: ["weekly", "monthly", "per_unit", null],
      default: null,
    },
  },
  { timestamps: true }
);

batchExpenseSchema.index({ batch: 1, stage: 1, category: 1 });

module.exports = mongoose.model("BatchExpense", batchExpenseSchema);
