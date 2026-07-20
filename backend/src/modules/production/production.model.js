const mongoose = require("mongoose");
const {
  PRODUCT_FAMILY_IDS,
  STAGE_IDS,
  INPUT_MATERIAL_TYPE_IDS,
} = require("../domain/mfg.constants");

const inputSchema = new mongoose.Schema(
  {
    materialType: {
      type: String,
      enum: [...INPUT_MATERIAL_TYPE_IDS, "reusable"],
      required: true,
    },
    quantityKg: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const outputSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 0 },
    family: { type: String, enum: PRODUCT_FAMILY_IDS, required: true },
  },
  { _id: false }
);

const stageSchema = new mongoose.Schema(
  {
    stage: { type: String, enum: STAGE_IDS, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "skipped"],
      default: "pending",
    },
    completedAt: { type: Date, default: null },
    goodUnits: { type: Number, default: null },
    brokenUnits: { type: Number, default: null },
    brokenKg: { type: Number, default: null },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const outputProgressSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    furnaceQty: { type: Number, default: 0, min: 0 },
    goodAfterTurning: { type: Number, default: 0, min: 0 },
    brokenAfterTurning: { type: Number, default: 0, min: 0 },
    finishedQty: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * Manufacturing production batch (Phase B+).
 * Legacy fields (product, inputScrapKg, …) kept optional for old migrated docs.
 */
const productionBatchSchema = new mongoose.Schema(
  {
    batchNo: { type: String, required: true, unique: true, trim: true },
    family: { type: String, enum: PRODUCT_FAMILY_IDS, required: true, index: true },
    isRework: { type: Boolean, default: false },
    productionDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["in_progress", "completed", "cancelled"],
      default: "in_progress",
      index: true,
    },
    currentStage: { type: String, enum: STAGE_IDS, default: "furnace", index: true },

    inputs: { type: [inputSchema], default: [] },
    outputs: { type: [outputSchema], default: [] },
    furnaceWasteKg: { type: Number, min: 0, default: 0 },
    handKg: { type: Number, min: 0, default: 0 },
    stages: { type: [stageSchema], default: [] },
    outputProgress: { type: [outputProgressSchema], default: [] },

    notes: { type: String, trim: true, default: "" },

    // Legacy (Phase 1–9) — optional for old records
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    inputScrapKg: { type: Number, min: 0, default: null },
    materialLossKg: { type: Number, min: 0, default: null },
    returnedScrapKg: { type: Number, min: 0, default: null },
    goodUnits: { type: Number, min: 0, default: null },
    rejectedUnits: { type: Number, min: 0, default: null },
  },
  { timestamps: true }
);

productionBatchSchema.virtual("totalInputKg").get(function totalInputKg() {
  return (this.inputs || []).reduce((s, i) => s + (i.quantityKg || 0), 0);
});

productionBatchSchema.virtual("totalFurnaceUnits").get(function totalFurnaceUnits() {
  return (this.outputs || []).reduce((s, o) => s + (o.quantity || 0), 0);
});

productionBatchSchema.set("toJSON", { virtuals: true });
productionBatchSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("ProductionBatch", productionBatchSchema);
