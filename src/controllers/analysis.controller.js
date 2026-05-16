import Analysis from "../models/analysis.model.js";
import FileCache from "../models/FileCache.model.js";
import { sendToFacia, getFaciaResult } from '../services/facia.service.js';
import { saveAnalysisRecord } from './historial.controller.js';
import { analyze as trustAnalyze } from '../trust-analysis/TrustAnalysisEngine.js';
import { computeFileHash } from '../utils/fileHash.js';

export const startAnalysis = async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;
        if (!fileUrl) return res.status(400).json({ error: "fileUrl requerido" });

        // ── CACHÉ ────────────────────────────────────────────────────────────
        const fileHash = await computeFileHash(fileUrl);
        if (fileHash) {
            const cached = await FileCache.findOne({ fileHash });
            if (cached) {
                console.log(`Cache HIT: ${fileHash.slice(0, 12)}...`);
                await FileCache.findOneAndUpdate({ fileHash }, { $inc: { hitCount: 1 } });

                saveAnalysisRecord({
                    userId: req.userId || null, fileUrl, fileName: fileName || null,
                    faciaReferenceId: cached.faciaReferenceId,
                    verdict: cached.verdict, isDeepfake: cached.isDeepfake,
                    confidence: cached.confidence, riskLevel: cached.riskLevel,
                    trustScore: cached.trustScore, interpretedLabel: cached.interpretedLabel,
                    explanation: cached.explanation, recommendations: cached.recommendations,
                    analysisCategory: cached.analysisCategory, faciaResponse: null,
                }).catch(err => console.error("Error guardando registro cacheado:", err));

                return res.status(200).json({
                    success: true, analysisId: cached.faciaReferenceId,
                    fromCache: true, status: "completed",
                    message: "Resultado obtenido del caché (archivo ya analizado anteriormente).",
                    result: {
                        analysisId:        cached.faciaReferenceId,
                        verdict:           cached.verdict,
                        isDeepfake:        cached.isDeepfake,
                        isAuthentic:       !cached.isDeepfake,
                        isInconclusive:    cached.isInconclusive || false,
                        isGreyZone:        cached.isGreyZone || false,
                        riskLevel:         cached.riskLevel,
                        trustScore:        cached.trustScore,
                        manipulationIndex: cached.manipulationIndex,
                        interpretedLabel:  cached.interpretedLabel,
                        explanation:       cached.explanation,
                        recommendations:   cached.recommendations,
                        analysisCategory:  cached.analysisCategory,
                        processing:        false,
                    },
                });
            }
        }
        // ────────────────────────────────────────────────────────────────────

        const referenceId = await sendToFacia(fileUrl);

        saveAnalysisRecord({
            userId: req.userId || null, fileUrl, fileName: fileName || null,
            faciaReferenceId: referenceId, verdict: "processing",
            isDeepfake: null, confidence: null, faciaResponse: null,
            ...(fileHash ? { fileHash } : {}),
        }).catch(err => console.error("Error guardando registro inicial:", err));

        return res.status(200).json({
            success: true, analysisId: referenceId, fromCache: false,
            message: "Archivo enviado a análisis correctamente.",
            estimatedTime: "5-30 segundos", status: "processing",
        });

    } catch (error) {
        console.error("Error startAnalysis:", error);
        let errorMessage = "Error interno del servidor", statusCode = 500;
        if (error.message.includes("FailedFacia")) { errorMessage = "No se pudo enviar el archivo a análisis."; statusCode = 503; }
        else if (error.message.includes("S3"))     { errorMessage = "No se pudo acceder al archivo."; statusCode = 404; }
        return res.status(statusCode).json({ success: false, error: errorMessage });
    }
};

// ─── Helper compartido para procesar resultado de Facia ──────────────────────
async function processResult(result, userId) {
    const score         = result.deepfake_score;
    const evasionAttack = result.decline_code === "FADR07";
    const fileType      = /\.(mp4|mov|avi|webm)/i.test(result.client_reference || "") ? "video" : "image";

    const trust = await trustAnalyze({
        score, evasionAttack, fileType,
        userId:      userId || null,
        faciaStatus: result.status,
        declineCode: result.decline_code,
    });

    return { score, trust };
}

export const getAnalysisResult = async (req, res) => {
    try {
        const { referenceId } = req.body;
        if (!referenceId) return res.status(400).json({ success: false, error: "referenceId requerido" });

        const result     = await getFaciaResult(referenceId);
        const isComplete = result.status !== null && result.deepfake_score !== null;

        if (!isComplete) {
            return res.status(202).json({
                success: true, processing: true,
                message: "El análisis aún está en proceso.",
                result:  { analysisId: result.reference_id, status: "processing" },
            });
        }

        const { score, trust } = await processResult(result, req.userId);

        // Persistir resultado
        try {
            await Analysis.findOneAndUpdate(
                { faciaReferenceId: referenceId },
                {
                    verdict:           trust.verdict,
                    isDeepfake:        trust.isDeepfake,
                    confidence:        typeof score === 'number' ? (score * 100).toFixed(2) : null,
                    manipulationIndex: trust.manipulationIndex,
                    faciaResponse:     result,
                    riskLevel:         trust.riskLevel,
                    trustScore:        trust.trustScore,
                    interpretedLabel:  trust.interpretedLabel,
                    explanation:       trust.explanation,
                    recommendations:   trust.recommendations,
                    analysisCategory:  trust.analysisCategory,
                    isInconclusive:    trust.isInconclusive,
                    isGreyZone:        trust.isGreyZone,
                }
            );
        } catch (e) { console.error("Error actualizando registro:", e); }

        // Guardar en caché
        try {
            const analysis = await Analysis.findOne({ faciaReferenceId: referenceId }).select("fileHash");
            if (analysis?.fileHash) {
                await FileCache.findOneAndUpdate(
                    { fileHash: analysis.fileHash },
                    {
                        fileHash: analysis.fileHash, faciaReferenceId: referenceId,
                        verdict: trust.verdict, isDeepfake: trust.isDeepfake,
                        riskLevel: trust.riskLevel, trustScore: trust.trustScore,
                        manipulationIndex: trust.manipulationIndex,
                        interpretedLabel: trust.interpretedLabel,
                        explanation: trust.explanation, recommendations: trust.recommendations,
                        analysisCategory: trust.analysisCategory,
                        isInconclusive: trust.isInconclusive, isGreyZone: trust.isGreyZone,
                        confidence: typeof score === 'number' ? (score * 100).toFixed(2) : null,
                    },
                    { upsert: true, new: true }
                );
            }
        } catch (e) { console.error("Error guardando en caché:", e); }

        return res.status(200).json({
            success: true, processing: false, fromCache: false,
            result: {
                analysisId:        result.reference_id,
                timestamp:         new Date().toISOString(),
                type:              result.type,
                status:            result.status,
                decline_code:      result.decline_code,
                decline_reason:    result.decline_reason,
                declined_proof:    result.declined_proof,
                client_reference:  result.client_reference,
                deepfake_score:    score,
                // UI fields
                verdict:           trust.verdict,
                isDeepfake:        trust.isDeepfake,
                isAuthentic:       !trust.isDeepfake,
                isInconclusive:    trust.isInconclusive,
                isGreyZone:        trust.isGreyZone,
                invalidCase:       trust.invalidCase,
                riskLevel:         trust.riskLevel,
                trustScore:        trust.trustScore,
                manipulationIndex: trust.manipulationIndex,  // "Índice de manipulación"
                interpretedLabel:  trust.interpretedLabel,
                explanation:       trust.explanation,
                recommendations:   trust.recommendations,
                analysisCategory:  trust.analysisCategory,
                recidivism:        trust.recidivism,
            },
        });

    } catch (error) {
        console.error("Error getAnalysisResult:", error);
        let errorMessage = "Error obteniendo resultado del análisis", statusCode = 500;
        if (error.message.includes("FailedFaciaResult"))       { errorMessage = "ID de referencia inválido."; statusCode = 404; }
        else if (error.message.includes("multiples intentos")) { errorMessage = "El análisis está tardando. Intenta de nuevo."; statusCode = 408; }
        return res.status(statusCode).json({ success: false, error: errorMessage });
    }
};

export const checkAnalysisStatus = async (req, res) => {
    try {
        const { referenceId } = req.params;
        if (!referenceId) return res.status(400).json({ success: false, error: "referenceId requerido" });

        const result     = await getFaciaResult(referenceId, 1, 0);
        const isComplete = result.status !== null && result.deepfake_score !== null;

        let computed = null;
        if (isComplete) {
            const { score, trust } = await processResult(result, req.userId);
            computed = {
                verdict: trust.verdict, isDeepfake: trust.isDeepfake,
                isInconclusive: trust.isInconclusive, isGreyZone: trust.isGreyZone,
                manipulationIndex: trust.manipulationIndex,
                riskLevel: trust.riskLevel, trustScore: trust.trustScore,
                interpretedLabel: trust.interpretedLabel,
                explanation: trust.explanation, recommendations: trust.recommendations,
            };
        }

        return res.status(200).json({
            success: true, analysisId: referenceId,
            status: isComplete ? "completed" : "processing",
            isComplete, result: computed,
        });

    } catch (error) {
        console.error("Error checkAnalysisStatus:", error);
        return res.status(500).json({ success: false, error: "Error verificando estado" });
    }
};