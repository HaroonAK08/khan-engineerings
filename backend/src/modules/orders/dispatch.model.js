const mongoose = require("mongoose");

const dispatchItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const dispatchSchema = new mongoose.Schema(
  {
    dispatchNo: { type: String, required: true, unique: true, trim: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", default: null },
    items: { type: [dispatchItemSchema], default: [] },
    dispatchDate: { type: Date, required: true, index: true },
    biltyNo: { type: String, trim: true, default: "" },
    transporter: { type: String, trim: true, default: "" },
    vehicleNo: { type: String, trim: true, default: "" },
    freightAmount: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dispatch", dispatchSchema);
