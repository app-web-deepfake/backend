import Analysis from "../models/analysis.model.js";

export const getUserHistory = async (req, res) => {
    try {
        const userId = req.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [analyses, total] = await Promise.all([
            Analysis.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select("fileUrl fileName verdict isDeepfake confidence createdAt faciaReferenceId"),
            Analysis.countDocuments({ userId })
        ]);

        res.json({
            success: true,
            data: analyses,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error("getUserHistory error:", err);
        res.status(500).json({ success: false, error: "Error obteniendo historial" });
    }
};

export const saveAnalysisRecord = async ({ userId, fileUrl, fileName, faciaReferenceId, verdict, isDeepfake, confidence, faciaResponse }) => {
    try {
        const record = new Analysis({
            userId: userId || null,
            fileUrl,
            fileName: fileName || null,
            faciaReferenceId: faciaReferenceId || null,
            verdict: verdict || "processing",
            isDeepfake: isDeepfake ?? null,
            confidence: confidence || null,
            faciaResponse: faciaResponse || null
        });
        await record.save();
        return record;
    } catch (err) {
        console.error("saveAnalysisRecord error:", err);
        return null;
    }
};