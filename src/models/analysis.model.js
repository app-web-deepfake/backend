import mongoose from "mongoose";

const AnalysisSchema = new mongoose.Schema({
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fileUrl:          { type: String, required: true },
    fileName:         { type: String, default: null },
    faciaReferenceId: { type: String, default: null },
    faciaResponse:    { type: Object, default: null },

    // Resultado básico (mantenidos por compatibilidad)
    verdict:          { type: String, enum: ["REAL", "FAKE", "processing"], default: "processing" },
    isDeepfake:       { type: Boolean, default: null },
    confidence:       { type: String, default: null },

    // ── TrustAnalysisEngine ──────────────────────────────────────────────────
    riskLevel:        { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: null },
    trustScore:       { type: Number, default: null },          // 0-100, inverso del riesgo
    interpretedLabel: { type: String, default: null },          // "Contenido auténtico", etc.
    explanation:      { type: String, default: null },          // Texto amigable
    recommendations:  { type: [String], default: [] },          // Array de recomendaciones
    analysisCategory: { type: String, default: "deepfake" },    // "deepfake" | "evasion"
    // ────────────────────────────────────────────────────────────────────────

    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Analysis", AnalysisSchema);