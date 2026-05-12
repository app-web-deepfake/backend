import Analysis from "../models/analysis.model.js";
import { sendToFacia, getFaciaResult } from '../services/facia.service.js';
import { saveAnalysisRecord } from './historial.controller.js';

export const startAnalysis = async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ error: "fileUrl requerido" });
        }

        const referenceId = await sendToFacia(fileUrl);

        // Guardar en historial inmediatamente al iniciar
        saveAnalysisRecord({
            userId: req.userId || null,
            fileUrl,
            fileName: fileName || null,
            faciaReferenceId: referenceId,
            verdict: "processing",
            isDeepfake: null,
            confidence: null,
            faciaResponse: null
        }).catch(err => console.error("Error guardando registro inicial:", err));

        return res.status(200).json({
            success: true,
            analysisId: referenceId,
            message: "Archivo enviado a analisis correctamente.",
            estimatedTime: "5-30 segundos",
            status: "processing"
        });

    } catch (error) {
        console.error("Error startAnalysis:", error);
        let errorMessage = "Error interno del servidor";
        let statusCode = 500;
        if (error.message.includes("FailedFacia")) {
            errorMessage = "No se pudo enviar el archivo a analisis. Por favor, intenta de nuevo.";
            statusCode = 503;
        } else if (error.message.includes("S3")) {
            errorMessage = "No se pudo acceder al archivo. Verifica que se haya subido correctamente.";
            statusCode = 404;
        }
        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
                message: "El analisis aun esta en proceso.",
                result: { analysisId: result.reference_id, status: "processing" }
            });
        }

        const score = result.deepfake_score;
        const scoreIndicatesReal = typeof score === 'number' && score < 0.6;
        const evasionAttackDetected = result.decline_code === "FADR07";
        const finalIsDeepfake = (result.status === 0) && !scoreIndicatesReal && !evasionAttackDetected;
        const finalVerdict = finalIsDeepfake ? "FAKE" : "REAL";

        // Actualizar el registro existente con el resultado final
        try {
            await Analysis.findOneAndUpdate(
                { faciaReferenceId: referenceId },
                {
                    verdict: finalVerdict,
                    isDeepfake: finalIsDeepfake,
                    confidence: typeof score === 'number' ? (score * 100).toFixed(2) : null,
                    faciaResponse: result
                }
            );
        } catch (e) {
            console.error("Error actualizando registro:", e);
        }

        return res.status(200).json({
            success: true,
            processing: false,
            result: {
                analysisId: result.reference_id,
                verdict: finalVerdict,
                timestamp: new Date().toISOString(),
                type: result.type,
                status: result.status,
                isDeepfake: finalIsDeepfake,
                isAuthentic: !finalIsDeepfake,
                confidence: typeof score === 'number' ? (score * 100).toFixed(2) : null,
                deepfake_score: score,
                decline_code: result.decline_code,
                decline_reason: result.decline_reason,
                declined_proof: result.declined_proof,
                client_reference: result.client_reference,
            }
        });

    } catch (error) {
        console.error("Error getAnalysisResult:", error);
        let errorMessage = "Error obteniendo resultado del analisis";
        let statusCode = 500;
        if (error.message.includes("FailedFaciaResult")) {
            errorMessage = "No se pudo obtener el resultado. El ID de referencia puede ser invalido.";
            statusCode = 404;
        } else if (error.message.includes("multiples intentos")) {
            errorMessage = "El analisis esta tomando mas tiempo del esperado. Intenta de nuevo en unos momentos.";
            statusCode = 408;
        }
        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const checkAnalysisStatus = async (req, res) => {
    try {
        const { referenceId } = req.params;
        if (!referenceId) {
            return res.status(400).json({ success: false, error: "referenceId requerido" });
        }

        const result = await getFaciaResult(referenceId, 1, 0);
        const isComplete = result.status !== null && result.deepfake_score !== null;

        let computed = null;
        if (isComplete) {
            const score = result.deepfake_score;
            const scoreIndicatesReal = typeof score === 'number' && score < 0.6;
            const evasionAttackDetected = result.decline_code === "FADR07";
            const finalIsDeepfake = (result.status === 0) && !scoreIndicatesReal && !evasionAttackDetected;
            computed = {
                isDeepfake: finalIsDeepfake,
                confidence: typeof score === 'number' ? (score * 100).toFixed(2) : null,
                verdict: finalIsDeepfake ? "FAKE" : "REAL"
            };
        }

        return res.status(200).json({
            success: true,
            analysisId: referenceId,
            status: isComplete ? "completed" : "processing",
            isComplete,
            result: computed
        });

    } catch (error) {
        console.error("Error checkAnalysisStatus:", error);
        return res.status(500).json({ success: false, error: "Error verificando estado del analisis" });
    }
};