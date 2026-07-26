const mongoose = require("mongoose");

const builtyItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 0 },
    pricingMode: { type: String, enum: ["rate_kg", "fixed"], default: "rate_kg" },
    ratePerKg: { type: Number, min: 0, default: 0 },
    weightKg: { type: Number, min: 0, default: 0 },
    unitPrice: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const builtySchema = new mongoose.Schema(
  {
    builtyNo: { type: String, required: true, unique: true, trim: true },
    billNo: { type: String, trim: true, default: "" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    builtyDate: { type: Date, required: true, index: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", default: null },
    items: { type: [builtyItemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    amountPaid: { type: Number, min: 0, default: 0 },
    balance: { type: Number, min: 0, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Builty", builtySchema);
