const mongoose = require("mongoose");

const customerLedgerSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    type: { type: String, enum: ["invoice", "payment", "adjustment"], required: true },
    amount: { type: Number, required: true, min: 0 },
    /** For adjustments: + increases receivable, - decreases */
    signedAmount: { type: Number, default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", default: null },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerPayment", default: null },
    entryDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerLedgerEntry", customerLedgerSchema);
