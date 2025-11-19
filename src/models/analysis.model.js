import mongoose from "mongoose";

const AnalysisSchema = new mongoose.Schema({
    fileUrl: { type: String, required: true },
    faciaResponse: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Analysis", AnalysisSchema);
