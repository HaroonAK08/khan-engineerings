const mongoose = require("mongoose");

const financeEntrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["income", "expense"], required: true, index: true },
    category: { type: String, trim: true, required: true },
    amount: { type: Number, required: true, min: 0 },
    entryDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
    reference: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FinanceEntry", financeEntrySchema);
