import mongoose from "mongoose";

const AnalysisSchema = new mongoose.Schema({
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fileUrl:          { type: String, required: true },
    fileName:         { type: String, default: null },
    fileHash:         { type: String, default: null, index: true },
    faciaReferenceId: { type: String, default: null },
    faciaResponse:    { type: Object, default: null },

    // Resultado básico
    verdict:    { type: String, enum: ["REAL", "FAKE", "processing"], default: "processing" },
    isDeepfake: { type: Boolean, default: null },
    confidence: { type: String, default: null },  // score crudo de Facia (interno)

    // TrustAnalysisEngine v3
    riskLevel:         { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: null },
    trustScore:        { type: Number, default: null },
    manipulationIndex: { type: Number, default: null },   // "Índice de manipulación" 0-100
    interpretedLabel:  { type: String, default: null },
    explanation:       { type: String, default: null },
    recommendations:   { type: [String], default: [] },
    analysisCategory:  { type: String, default: "deepfake" },
    isInconclusive:    { type: Boolean, default: false },
    isGreyZone:        { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Analysis", AnalysisSchema);