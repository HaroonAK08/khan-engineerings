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

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "app" },
    payrollPeriods: { type: [payrollPeriodSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppSetting", settingsSchema);
