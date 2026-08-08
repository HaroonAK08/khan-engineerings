const mongoose = require("mongoose");

const CHANNELS = ["power_engineering", "ik_engineering"];

const partyGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
    channel: {
      type: String,
      enum: CHANNELS,
      default: "power_engineering",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

partyGroupSchema.index({ name: 1 }, { unique: true });
partyGroupSchema.index({ channel: 1 });

module.exports = mongoose.model("PartyGroup", partyGroupSchema);
module.exports.CHANNELS = CHANNELS;
