const mongoose = require("mongoose");
const { STAGE_IDS, CATEGORY_IDS } = require("./expense.constants");

const batchExpenseSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionBatch",
      required: true,
      index: true,
    },
    stage: { type: String, enum: STAGE_IDS, required: true, index: true },
    category: { type: String, enum: CATEGORY_IDS, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

batchExpenseSchema.index({ batch: 1, stage: 1, category: 1 });

module.exports = mongoose.model("BatchExpense", batchExpenseSchema);
