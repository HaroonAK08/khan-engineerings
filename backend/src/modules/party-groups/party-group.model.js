const mongoose = require("mongoose");

const partyGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

partyGroupSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("PartyGroup", partyGroupSchema);
