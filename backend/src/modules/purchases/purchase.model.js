const mongoose = require("mongoose");
const { MATERIAL_TYPE_IDS } = require("../domain/mfg.constants");

const purchaseSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    materialType: {
      type: String,
      enum: MATERIAL_TYPE_IDS,
      required: true,
      default: "scrap",
      index: true,
    },
    quantityKg: { type: Number, required: true, min: 0 },
    ratePerKg: { type: Number, required: true, min: 0 },
    /** Material amount only: qty × rate */
    totalAmount: { type: Number, required: true, min: 0 },
    freightAmount: { type: Number, min: 0, default: 0 },
    amountPaid: { type: Number, min: 0, default: 0 },
    /** (totalAmount + freightAmount) - amountPaid */
    balance: { type: Number, required: true, min: 0, default: 0 },
    vehicleNo: { type: String, trim: true, default: "" },
    purchaseDate: { type: Date, required: true, index: true },
    invoiceNo: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

purchaseSchema.virtual("payable").get(function payable() {
  return Math.round((this.totalAmount + (this.freightAmount || 0)) * 100) / 100;
});

purchaseSchema.virtual("effectiveRatePerKg").get(function effectiveRatePerKg() {
  if (!this.quantityKg) return 0;
  return Math.round(((this.totalAmount + (this.freightAmount || 0)) / this.quantityKg) * 100) / 100;
});

purchaseSchema.set("toJSON", { virtuals: true });
purchaseSchema.set("toObject", { virtuals: true });

purchaseSchema.index({ invoiceNo: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
