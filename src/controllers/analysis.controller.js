import Analysis from "../models/analysis.model.js";
import { sendToFacia, getFaciaResult } from '../services/facia.service.js';
import { saveAnalysisRecord } from './historial.controller.js';
import { analyze as trustAnalyze } from '../trust-analysis/TrustAnalysisEngine.js';

export const startAnalysis = async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ error: "fileUrl requerido" });
        }

        const referenceId = await sendToFacia(fileUrl);

        saveAnalysisRecord({
            userId: req.userId || null,
            fileUrl,
            fileName: fileName || null,
            faciaReferenceId: referenceId,
            verdict: "processing",
            isDeepfake: null,
            confidence: null,
            faciaResponse: null,
        }).catch(err => console.error("Error guardando registro inicial:", err));

        return res.status(200).json({
            success: true,
            analysisId: referenceId,
            message: "Archivo enviado a análisis correctamente.",
            estimatedTime: "5-30 segundos",
            status: "processing",
        });

    } catch (error) {
        console.error("Error startAnalysis:", error);
        let errorMessage = "Error interno del servidor";
        let statusCode = 500;
        if (error.message.includes("FailedFacia")) {
            errorMessage = "No se pudo enviar el archivo a análisis. Por favor, intenta de nuevo.";
            statusCode = 503;
        } else if (error.message.includes("S3")) {
            errorMessage = "No se pudo acceder al archivo. Verifica que se haya subido correctamente.";
            statusCode = 404;
        }
        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

export const getAnalysisResult = async (req, res) => {
    try {
        const { referenceId } = req.body;

        if (!referenceId) {
            return res.status(400).json({ success: false, error: "referenceId requerido" });
        }

        const result = await getFaciaResult(referenceId);
        const isComplete = result.status !== null && result.deepfake_score !== null;

        if (!isComplete) {
            return res.status(202).json({
                success: true,
                processing: true,
                message: "El análisis aún está en proceso.",
                result: { analysisId: result.reference_id, status: "processing" },
            });
        }

        const score          = result.deepfake_score;
        const evasionAttack  = result.decline_code === "FADR07";

        // Detectar tipo de archivo desde la URL
        const fileType = /\.(mp4|mov|avi|webm)/i.test(result.client_reference || "")
            ? "video" : "image";

        // ── TrustAnalysisEngine ──────────────────────────────────────────────
        const trust = await trustAnalyze({
            score,
            evasionAttack,
            fileType,
            userId: req.userId || null,
        });
        // ────────────────────────────────────────────────────────────────────

        // Persistir resultado enriquecido
        try {
            await Analysis.findOneAndUpdate(
                { faciaReferenceId: referenceId },
                {
                    verdict:          trust.verdict,
                    isDeepfake:       trust.isDeepfake,
                    confidence:       typeof score === 'number' ? (score * 100).toFixed(2) : null,
                    faciaResponse:    result,
                    // TrustAnalysisEngine fields
                    riskLevel:        trust.riskLevel,
                    trustScore:       trust.trustScore,
                    interpretedLabel: trust.interpretedLabel,
                    explanation:      trust.explanation,
                    recommendations:  trust.recommendations,
                    analysisCategory: trust.analysisCategory,
                }
            );
        } catch (e) {
            console.error("Error actualizando registro:", e);
        }

        return res.status(200).json({
            success: true,
            processing: false,
            result: {
                analysisId:       result.reference_id,
                timestamp:        new Date().toISOString(),
                type:             result.type,
                status:           result.status,
                decline_code:     result.decline_code,
                decline_reason:   result.decline_reason,
                declined_proof:   result.declined_proof,
                client_reference: result.client_reference,
                deepfake_score:   score,
                confidence:       typeof score === 'number' ? (score * 100).toFixed(2) : null,

                // TrustAnalysisEngine
                verdict:          trust.verdict,
                isDeepfake:       trust.isDeepfake,
                isAuthentic:      !trust.isDeepfake,
                riskLevel:        trust.riskLevel,
                trustScore:       trust.trustScore,
                interpretedLabel: trust.interpretedLabel,
                explanation:      trust.explanation,
                recommendations:  trust.recommendations,
                analysisCategory: trust.analysisCategory,
                recidivism:       trust.recidivism,
            },
        });

    } catch (error) {
        console.error("Error getAnalysisResult:", error);
        let errorMessage = "Error obteniendo resultado del análisis";
        let statusCode = 500;
        if (error.message.includes("FailedFaciaResult")) {
            errorMessage = "No se pudo obtener el resultado. El ID de referencia puede ser inválido.";
            statusCode = 404;
        } else if (error.message.includes("multiples intentos")) {
            errorMessage = "El análisis está tomando más tiempo del esperado. Intenta de nuevo en unos momentos.";
            statusCode = 408;
        }
        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

export const checkAnalysisStatus = async (req, res) => {
    try {
        const { referenceId } = req.params;
        if (!referenceId) {
            return res.status(400).json({ success: false, error: "referenceId requerido" });
        }

        const result     = await getFaciaResult(referenceId, 1, 0);
        const isComplete = result.status !== null && result.deepfake_score !== null;

        let computed = null;
        if (isComplete) {
            const score         = result.deepfake_score;
            const evasionAttack = result.decline_code === "FADR07";
            const fileType      = /\.(mp4|mov|avi|webm)/i.test(result.client_reference || "")
                ? "video" : "image";

            const trust = await trustAnalyze({
                score,
                evasionAttack,
                fileType,
                userId: req.userId || null,
            });

            computed = {
                verdict:          trust.verdict,
                isDeepfake:       trust.isDeepfake,
                confidence:       typeof score === 'number' ? (score * 100).toFixed(2) : null,
                riskLevel:        trust.riskLevel,
                trustScore:       trust.trustScore,
                interpretedLabel: trust.interpretedLabel,
                explanation:      trust.explanation,
                recommendations:  trust.recommendations,
            };
        }

        return res.status(200).json({
            success:     true,
            analysisId:  referenceId,
            status:      isComplete ? "completed" : "processing",
            isComplete,
            result:      computed,
        });

    } catch (error) {
        console.error("Error checkAnalysisStatus:", error);
        return res.status(500).json({ success: false, error: "Error verificando estado del análisis" });
    }
};