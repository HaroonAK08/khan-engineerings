const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, required: true, index: true },
    method: {
      type: String,
      enum: ["cash", "bank", "cheque", "other"],
      default: "cash",
    },
    reference: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerPayment", paymentSchema);
