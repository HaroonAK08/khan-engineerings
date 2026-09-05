const mongoose = require("mongoose");

const vaultConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    pinHash: { type: String, required: true },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

const vaultAssetSchema = new mongoose.Schema(
  {
    owner: {
      type: String,
      enum: ["personal", "company"],
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["bank", "cash", "property", "investment", "other"],
      required: true,
      default: "bank",
    },
    name: { type: String, required: true, trim: true },
    institution: { type: String, default: "", trim: true },
    amount: { type: Number, required: true, default: 0 },
    notes: { type: String, default: "", trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const vaultSnapshotSchema = new mongoose.Schema(
  {
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VaultAsset",
      required: true,
      index: true,
    },
    owner: { type: String, enum: ["personal", "company"], required: true },
    kind: { type: String, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    recordedAt: { type: Date, required: true, index: true },
    year: { type: Number, required: true, index: true },
    month: { type: Number, required: true },
  },
  { timestamps: true }
);

vaultSnapshotSchema.index({ year: 1, month: 1, asset: 1 });

const VaultConfig = mongoose.model("VaultConfig", vaultConfigSchema);
const VaultAsset = mongoose.model("VaultAsset", vaultAssetSchema);
const VaultSnapshot = mongoose.model("VaultSnapshot", vaultSnapshotSchema);

module.exports = { VaultConfig, VaultAsset, VaultSnapshot };
