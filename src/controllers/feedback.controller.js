import AnalysisFeedback from "../models/AnalysisFeedback.model.js";
import Analysis from "../models/analysis.model.js";

/**
 * POST /analysis/:referenceId/feedback
 * El usuario reporta si el resultado fue correcto o no.
 */
export const submitFeedback = async (req, res) => {
    try {
        const { referenceId } = req.params;
        const { userAgreement, userVerdict, userComment } = req.body;

        if (typeof userAgreement !== "boolean") {
            return res.status(400).json({ success: false, error: "userAgreement (boolean) es requerido" });
        }

        // Buscar el análisis para obtener los datos del sistema
        const analysis = await Analysis.findOne({ faciaReferenceId: referenceId });
        if (!analysis) {
            return res.status(404).json({ success: false, error: "Análisis no encontrado" });
        }

        // Guardar feedback (upsert por si ya existe)
        await AnalysisFeedback.findOneAndUpdate(
            { userId: req.userId, analysisId: referenceId },
            {
                userId:           req.userId,
                analysisId:       referenceId,
                faciaReferenceId: referenceId,
                systemVerdict:    analysis.verdict,
                systemRiskLevel:  analysis.riskLevel,
                systemScore:      analysis.confidence ? parseFloat(analysis.confidence) : null,
                userAgreement,
                userVerdict:      userVerdict || "UNSURE",
                userComment:      userComment?.trim().slice(0, 500) || null,
            },
            { upsert: true, new: true }
        );

        return res.json({ success: true, message: "Gracias por tu reporte. Nos ayuda a mejorar." });

    } catch (err) {
        console.error("submitFeedback error:", err);
        return res.status(500).json({ success: false, error: "Error guardando feedback" });
    }
};

/**
 * GET /analysis/feedback-stats  (solo admin)
 * Estadísticas de feedback para revisar casos incorrectos.
 */
export const getFeedbackStats = async (req, res) => {
    try {
        const total       = await AnalysisFeedback.countDocuments();
        const incorrect   = await AnalysisFeedback.countDocuments({ userAgreement: false });
        const correct     = await AnalysisFeedback.countDocuments({ userAgreement: true });

        // Casos donde sistema dijo FAKE pero usuario dice era REAL
        const falsePositives = await AnalysisFeedback.countDocuments({
            userAgreement: false,
            systemVerdict: "FAKE",
            userVerdict:   "REAL",
        });

        // Casos donde sistema dijo REAL pero usuario dice era FAKE
        const falseNegatives = await AnalysisFeedback.countDocuments({
            userAgreement: false,
            systemVerdict: "REAL",
            userVerdict:   "FAKE",
        });

        // Últimos 10 reportes incorrectos con su score
        const recentIncorrect = await AnalysisFeedback.find({ userAgreement: false })
            .sort({ createdAt: -1 })
            .limit(10)
            .select("analysisId systemVerdict userVerdict systemScore systemRiskLevel userComment createdAt");

        return res.json({
            success: true,
            stats: { total, correct, incorrect, falsePositives, falseNegatives },
            recentIncorrect,
        });
    } catch (err) {
        console.error("getFeedbackStats error:", err);
        return res.status(500).json({ success: false, error: "Error obteniendo estadísticas" });
    }
};