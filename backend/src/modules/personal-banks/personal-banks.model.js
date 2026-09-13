const mongoose = require("mongoose");

const authSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "personal_banks" },
    pinHash: { type: String, default: "" },
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

const bankSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

bankSchema.index({ name: 1 }, { unique: true });

const accountSchema = new mongoose.Schema(
  {
    bank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PersonalBank",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    balance: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

accountSchema.index({ bank: 1, name: 1 });

const transactionSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PersonalAccount",
      required: true,
      index: true,
    },
    bank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PersonalBank",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["deposit", "send", "adjust"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true },
    recipient: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    txnDate: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

module.exports = {
  PersonalBanksAuth: mongoose.model("PersonalBanksAuth", authSchema),
  PersonalBank: mongoose.model("PersonalBank", bankSchema),
  PersonalAccount: mongoose.model("PersonalAccount", accountSchema),
  PersonalTransaction: mongoose.model("PersonalTransaction", transactionSchema),
};
