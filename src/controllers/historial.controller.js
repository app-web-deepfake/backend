import Analysis from "../models/analysis.model.js";

export const getUserHistory = async (req, res) => {
    try {
        const userId = req.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = { userId };
        if (req.query.verdict && ["FAKE", "REAL", "processing"].includes(req.query.verdict)) {
            filter.verdict = req.query.verdict;
        }

        const [analyses, total] = await Promise.all([
            Analysis.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select("fileUrl fileName verdict isDeepfake confidence createdAt faciaReferenceId"),
            Analysis.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: analyses,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error("getUserHistory error:", err);
        res.status(500).json({ success: false, error: "Error obteniendo historial" });
    }
};

export const deleteAnalysis = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Analysis.findOneAndDelete({ _id: id, userId: req.userId });
        if (!deleted)
            return res.status(404).json({ success: false, error: "Registro no encontrado" });
        res.json({ success: true, message: "Registro eliminado" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error eliminando registro" });
    }
};

export const deleteAllAnalysis = async (req, res) => {
    try {
        const result = await Analysis.deleteMany({ userId: req.userId });
        res.json({ success: true, deleted: result.deletedCount, message: "Historial eliminado" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error eliminando historial" });
    }
};

export const saveAnalysisRecord = async ({ userId, fileUrl, fileName, faciaReferenceId, verdict, isDeepfake, confidence, faciaResponse, fileHash }) => {
    try {
        const record = new Analysis({
            userId: userId || null,
            fileUrl,
            fileName: fileName || null,
            faciaReferenceId: faciaReferenceId || null,
            verdict: verdict || "processing",
            isDeepfake: isDeepfake ?? null,
            confidence: confidence || null,
            faciaResponse: faciaResponse || null,
            fileHash: fileHash || null,  // ← esta línea faltaba
        });
        await record.save();
        return record;
    } catch (err) {
        console.error("saveAnalysisRecord error:", err);
        return null;
    }
};