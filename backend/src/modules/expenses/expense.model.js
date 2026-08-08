const mongoose = require("mongoose");
const { STAGE_IDS, CATEGORY_IDS } = require("./expense.constants");

const EXPENSE_SCOPES = ["hub", "drum", "common"];

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
    /** Short label for miscellaneous / other expenses */
    title: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    /** Optional purchase qty for paint/tools/etc. (factory overhead) */
    quantity: { type: Number, min: 0, default: null },
    /** Unit for quantity — kg, pcs, L, etc. */
    quantityUnit: { type: String, trim: true, default: "kg" },
    /** Hub-only / drum-only / common — used for per-kg overhead allocation */
    scope: {
      type: String,
      enum: EXPENSE_SCOPES,
      default: "common",
      index: true,
    },
    /** When salary was paid to a named worker */
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      default: null,
      index: true,
    },
    /** When commission / payment was paid to a salesman */
    salesman: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salesman",
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
module.exports.EXPENSE_SCOPES = EXPENSE_SCOPES;
