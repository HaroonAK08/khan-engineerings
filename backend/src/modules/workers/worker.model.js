const mongoose = require("mongoose");

const PAY_TYPES = ["weekly", "monthly", "per_unit"];
const PAY_DAYS = ["monday", "thursday"];

const workerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Urdu display name (shown when UI locale is Urdu) */
    nameUr: { type: String, trim: true, default: "" },
    /**
     * Last / preferred pay style — not locked.
     * Each payment can pick weekly, monthly, or per unit independently.
     */
    payType: { type: String, enum: [...PAY_TYPES, null], default: null },
    /** Last paid amount (or last per-unit rate) — suggestion only */
    rate: { type: Number, default: null, min: 0 },
    /** Label for per_unit (e.g. hub, drum, piece) */
    unitLabel: { type: String, trim: true, default: "piece" },
    payDays: {
      type: [{ type: String, enum: PAY_DAYS }],
      default: () => ["monday", "thursday"],
    },
    job: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

workerSchema.index({ name: "text" });

module.exports = mongoose.model("Worker", workerSchema);
module.exports.PAY_TYPES = PAY_TYPES;
module.exports.PAY_DAYS = PAY_DAYS;
