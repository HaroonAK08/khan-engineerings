const mongoose = require("mongoose");

const payrollPeriodSchema = new mongoose.Schema(
  {
    /** Accounting month key YYYY-MM (e.g. 2026-07) */
    month: { type: String, required: true, trim: true },
    /** Payment dates that count toward this month (inclusive) */
    paymentFrom: { type: String, required: true, trim: true },
    paymentTo: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const wasteHistorySchema = new mongoose.Schema(
  {
    family: { type: String, enum: ["hub", "drum"], required: true },
    percent: { type: Number, required: true, min: 0, max: 99 },
    previousPercent: { type: Number, default: null },
    effectiveFrom: { type: Date, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "app" },
    payrollPeriods: { type: [payrollPeriodSchema], default: [] },
    wasteHubPercent: { type: Number, min: 0, max: 99, default: 6 },
    wasteDrumPercent: { type: Number, min: 0, max: 99, default: 6 },
    wasteHubFrom: { type: Date, default: null },
    wasteDrumFrom: { type: Date, default: null },
    wasteHistory: { type: [wasteHistorySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppSetting", settingsSchema);
