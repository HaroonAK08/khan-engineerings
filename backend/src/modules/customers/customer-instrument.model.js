const mongoose = require("mongoose");

const instrumentSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    kind: { type: String, enum: ["cheque", "promise"], required: true },
    amount: { type: Number, required: true, min: 0 },
    recordedDate: { type: Date, required: true, index: true },
    dueDate: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["pending", "received"], default: "pending", index: true },
    receivedDate: { type: Date, default: null },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerPayment", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerInstrument", instrumentSchema);
