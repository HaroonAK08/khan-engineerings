const mongoose = require("mongoose");

const productSizeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSizeSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("ProductSize", productSizeSchema);
