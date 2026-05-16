import mongoose from "mongoose";

/**
 * AnalysisFeedback — el usuario reporta si el resultado fue correcto o no.
 * Sirve para calibrar umbrales y detectar patrones de error.
 */
const AnalysisFeedbackSchema = new mongoose.Schema({
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    analysisId:       { type: String, required: true },          // faciaReferenceId
    faciaReferenceId: { type: String, required: true },

    // Resultado que el sistema dio
    systemVerdict:    { type: String, enum: ["REAL", "FAKE"], required: true },
    systemRiskLevel:  { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    systemScore:      { type: Number },

    // Lo que el usuario dice
    userAgreement:    { type: Boolean, required: true },          // true = correcto, false = incorrecto
    userComment:      { type: String, default: null, maxlength: 500 },
    // Qué cree el usuario que es realmente
    userVerdict:      { type: String, enum: ["REAL", "FAKE", "UNSURE"], default: "UNSURE" },

    createdAt: { type: Date, default: Date.now },
});

// Índice para evitar feedback duplicado del mismo usuario en el mismo análisis
AnalysisFeedbackSchema.index({ userId: 1, analysisId: 1 }, { unique: true });

export default mongoose.model("AnalysisFeedback", AnalysisFeedbackSchema);