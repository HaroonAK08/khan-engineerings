const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    type: { type: String, enum: ["purchase", "payment", "adjustment"], required: true },
    /** Absolute amount. Sign applied by type: purchase/debit+, payment-, adjustment uses signedAmount */
    amount: { type: Number, required: true, min: 0 },
    /** For adjustments only: positive = increase owed, negative = decrease owed */
    signedAmount: { type: Number, default: null },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase", default: null },
    /** Optional due ledger entry this payment was recorded against (e.g. previous pending). */
    appliesTo: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerEntry", default: null },
    entryDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
