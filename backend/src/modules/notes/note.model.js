const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    content: { type: String, default: "", maxlength: 50000 },
  },
  { timestamps: true }
);

noteSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model("Note", noteSchema);
