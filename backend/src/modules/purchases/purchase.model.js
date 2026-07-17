const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    quantityKg: { type: Number, required: true, min: 0 },
    ratePerKg: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    purchaseDate: { type: Date, required: true, index: true },
    invoiceNo: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    material: { type: String, default: "scrap", immutable: true },
  },
  { timestamps: true }
);

purchaseSchema.index({ invoiceNo: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
