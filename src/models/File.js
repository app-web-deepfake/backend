import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fileType: { type: String, enum: ['image', 'video'], required: true },
    s3Key: { type: String },
    status: { type: String, enum: ['pending_upload','uploaded','analyzed','error'], default: 'pending_upload' },
    analysisResult: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    uploadedAt: { type: Date },
    analyzedAt: { type: Date }
});

export default mongoose.model('File', fileSchema);
