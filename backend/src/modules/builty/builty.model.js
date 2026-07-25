const mongoose = require("mongoose");

/**
 * A builty is one delivery slip covering every order a customer is getting
 * at that time. Money figures are derived from the linked orders, never stored
 * here, so the builty can never drift from the order ledger.
 */
const builtySchema = new mongoose.Schema(
  {
    builtyNo: { type: String, required: true, unique: true, trim: true },
    billNo: { type: String, trim: true, default: "" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    orders: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder" }],
      default: [],
    },
    builtyDate: { type: Date, required: true, index: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", default: null },
    transporter: { type: String, trim: true, default: "" },
    vehicleNo: { type: String, trim: true, default: "" },
    freightAmount: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Builty", builtySchema);
