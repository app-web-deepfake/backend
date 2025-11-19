import mongoose from "mongoose";

const uploadSchema = new mongoose.Schema({
    fileUrl: { type: String, required: true },
    fileType: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Upload", uploadSchema);
