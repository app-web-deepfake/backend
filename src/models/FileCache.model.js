import mongoose from "mongoose";

/**
 * FileCache — evita re-analizar archivos ya procesados por Facia
 * El hash MD5/SHA256 identifica el contenido del archivo,
 * independientemente del nombre o URL.
 */
const FileCacheSchema = new mongoose.Schema({
    fileHash:         { type: String, required: true, unique: true, index: true },
    faciaReferenceId: { type: String, required: true },

    // Resultado del TrustAnalysisEngine (copia para respuesta rápida)
    verdict:          { type: String, enum: ["REAL", "FAKE"] },
    riskLevel:        { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    trustScore:       { type: Number },
    interpretedLabel: { type: String },
    explanation:      { type: String },
    recommendations:  { type: [String], default: [] },
    analysisCategory: { type: String, default: "deepfake" },
    confidence:       { type: String },
    isDeepfake:       { type: Boolean },

    hitCount:  { type: Number, default: 1 },   // cuántas veces se reutilizó
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

FileCacheSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    next();
});

export default mongoose.model("FileCache", FileCacheSchema);