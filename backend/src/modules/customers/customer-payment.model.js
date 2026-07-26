const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    builty: { type: mongoose.Schema.Types.ObjectId, ref: "Builty", default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, required: true, index: true },
    method: {
      type: String,
      enum: ["cash", "bank", "cheque", "online", "other"],
      default: "cash",
    },
    reference: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerPayment", paymentSchema);
