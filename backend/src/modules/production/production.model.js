const mongoose = require("mongoose");

/**
 * One melting/production run.
 * Stock impact: netConsumedKg = inputScrapKg - returnedScrapKg
 * materialLossKg is waste within the melt (does not return to stock).
 */
const productionBatchSchema = new mongoose.Schema(
  {
    batchNo: { type: String, required: true, unique: true, trim: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productionDate: { type: Date, required: true, index: true },
    /** Scrap charged into the furnace (kg) */
    inputScrapKg: { type: Number, required: true, min: 0 },
    /** Waste / slag / burn-off (kg) */
    materialLossKg: { type: Number, required: true, min: 0, default: 0 },
    /** Unused scrap returned to stock (kg) */
    returnedScrapKg: { type: Number, required: true, min: 0, default: 0 },
    /** Finished good pieces */
    goodUnits: { type: Number, required: true, min: 0, default: 0 },
    /** Defective / rejected pieces */
    rejectedUnits: { type: Number, required: true, min: 0, default: 0 },
    notes: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["completed"], default: "completed" },
  },
  { timestamps: true }
);

productionBatchSchema.virtual("netConsumedKg").get(function netConsumedKg() {
  return Math.round((this.inputScrapKg - this.returnedScrapKg) * 1000) / 1000;
});

productionBatchSchema.virtual("totalUnits").get(function totalUnits() {
  return this.goodUnits + this.rejectedUnits;
});

productionBatchSchema.set("toJSON", { virtuals: true });
productionBatchSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("ProductionBatch", productionBatchSchema);
