const mongoose = require("mongoose");

const syncUploadSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    deviceId: { type: String, required: true, trim: true, index: true },
    snapshotId: { type: String, required: true, trim: true },
    sequence: { type: Number, required: true, min: 1 },
    archiveSha256: { type: String, required: true, trim: true },
    encryptedSize: { type: Number, required: true, min: 0 },
    chunkSize: { type: Number, required: true, min: 1 },
    chunkCount: { type: Number, required: true, min: 1 },
    protocolVersion: { type: Number, required: true, default: 1 },
    schemaVersion: { type: String, default: "1" },
    status: { type: String, enum: ["uploading", "complete"], default: "uploading" },
    nonce: String,
    authTag: String,
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

syncUploadSchema.index({ deviceId: 1, sequence: -1 });
syncUploadSchema.index({ deviceId: 1, snapshotId: 1 }, { unique: true });

const syncChunkSchema = new mongoose.Schema(
  {
    upload: { type: mongoose.Schema.Types.ObjectId, ref: "SyncUpload", required: true, index: true },
    index: { type: Number, required: true, min: 0 },
    sha256: { type: String, required: true, trim: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

syncChunkSchema.index({ upload: 1, index: 1 }, { unique: true });

const SyncUpload = mongoose.model("SyncUpload", syncUploadSchema);
const SyncChunk = mongoose.model("SyncChunk", syncChunkSchema);

module.exports = { SyncUpload, SyncChunk };
