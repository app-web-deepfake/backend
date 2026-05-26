import mongoose from "mongoose";

const FileCacheSchema = new mongoose.Schema({
    fileHash:         { type: String, required: true, unique: true, index: true },
    faciaReferenceId: { type: String, required: true },

    // Resultado del TrustAnalysisEngine v4
    verdict:          { type: String, enum: ["REAL", "FAKE"] },
    riskLevel:        { type: String, enum: ["LOW", "MEDIUM", "SUSPICIOUS", "HIGH", "CRITICAL"] },
    trustScore:       { type: Number },
    manipulationIndex:{ type: Number },
    interpretedLabel: { type: String },
    explanation:      { type: String },
    recommendations:  { type: [String], default: [] },
    analysisCategory: { type: String, default: "deepfake" },
    confidence:       { type: String },
    isDeepfake:       { type: Boolean },
    isInconclusive:   { type: Boolean, default: false },
    isGreyZone:       { type: Boolean, default: false },
    isSuspicious:     { type: Boolean, default: false },

    hitCount:  { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

FileCacheSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    next();
});

export default mongoose.model("FileCache", FileCacheSchema);