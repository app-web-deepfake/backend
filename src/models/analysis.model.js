import mongoose from "mongoose";

const AnalysisSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fileUrl: { type: String, required: true },
    fileName: { type: String, default: null },
    faciaReferenceId: { type: String, default: null },
    faciaResponse: { type: Object, required: true },
    verdict: { type: String, enum: ["REAL", "FAKE", "processing"], default: "processing" },
    isDeepfake: { type: Boolean, default: null },
    confidence: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Analysis", AnalysisSchema);