const mongoose = require("mongoose");

const salesmanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

salesmanSchema.index({ name: 1 });

module.exports = mongoose.model("Salesman", salesmanSchema);
