/**
 * CAMBIOS vs versión anterior:
 * - Import: facia.service → deepfake.service
 * - sendToFacia → sendToDeepfake (retorna score+hasFace directamente, sin polling)
 * - processResult: recibe { score, mediaType, hasFace, details } de ZeroTrue
 * - TrustAnalysisEngine: pasa mediaType + hasFace (nuevos params de v4)
 * - El caché y el historial NO cambian — mismo contrato con MongoDB
 */

import Analysis from "../models/analysis.model.js";
import FileCache from "../models/FileCache.model.js";
import { sendToDeepfake } from '../services/deepfake.service.js';
import { saveAnalysisRecord } from './historial.controller.js';
import { analyze as trustAnalyze } from '../trust-analysis/TrustAnalysisEngine.js';
import { computeFileHash } from '../utils/fileHash.js';

// ─── Helper: detectar tipo de media por URL ───────────────────────────────────
function detectMediaTypeFromUrl(fileUrl) {
    const url = (fileUrl || '').toLowerCase().split('?')[0];
    if (/\.(mp4|mov|avi|webm|mkv)$/.test(url)) return 'video';
    return 'image';
}

// ─── Procesar resultado de ZeroTrue → TrustAnalysisEngine ────────────────────
/**
 * Convierte la respuesta normalizada de ZeroTrue en una evaluación completa
 * usando el TrustAnalysisEngine v4.
 *
 * @param {{ score: number, mediaType: string, hasFace: boolean, details: object }} ztResult
 * @param {string|null} userId
 * @returns {Promise<{ score: number, trust: object }>}
 */
async function processZeroTrueResult(ztResult, userId) {
    const { score, mediaType, hasFace, details } = ztResult;

    // ZeroTrue no tiene código de evasión equivalente a FADR07 de Facia,
    // pero podemos detectarlo si la confianza es anormalmente alta y hasFace=false
    const evasionAttack = false; // ZeroTrue maneja esto internamente

    const trust = await trustAnalyze({
        score,
        mediaType,
        hasFace,
        evasionAttack,
        userId: userId || null,
        declineCode: null,      // ZeroTrue no usa códigos FADR
        faciaStatus: null,
    });

    return { score, trust, details };
}

// ─── startAnalysis ────────────────────────────────────────────────────────────
export const startAnalysis = async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;
        if (!fileUrl) return res.status(400).json({ error: 'fileUrl requerido' });

        // ── CACHÉ ──────────────────────────────────────────────────────────────
        const fileHash = await computeFileHash(fileUrl);
        if (fileHash) {
            const cached = await FileCache.findOne({ fileHash });
            if (cached) {
                console.log(`[Cache HIT] ${fileHash.slice(0, 12)}...`);
                await FileCache.findOneAndUpdate({ fileHash }, { $inc: { hitCount: 1 } });

                saveAnalysisRecord({
                    userId: req.userId || null, fileUrl, fileName: fileName || null,
                    faciaReferenceId: cached.faciaReferenceId,
                    verdict: cached.verdict, isDeepfake: cached.isDeepfake,
                    confidence: cached.confidence, riskLevel: cached.riskLevel,
                    trustScore: cached.trustScore, interpretedLabel: cached.interpretedLabel,
                    explanation: cached.explanation, recommendations: cached.recommendations,
                    analysisCategory: cached.analysisCategory, faciaResponse: null,
                }).catch(err => console.error('Error guardando registro cacheado:', err));

                return res.status(200).json({
                    success: true,
                    analysisId: cached.faciaReferenceId,
                    fromCache: true,
                    status: 'completed',
                    message: 'Resultado obtenido del caché (archivo ya analizado anteriormente).',
                    result: {
                        analysisId:        cached.faciaReferenceId,
                        verdict:           cached.verdict,
                        isDeepfake:        cached.isDeepfake,
                        isAuthentic:       !cached.isDeepfake,
                        isInconclusive:    cached.isInconclusive || false,
                        isGreyZone:        cached.isGreyZone || false,
                        isSuspicious:      cached.isSuspicious || false,
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
        // ──────────────────────────────────────────────────────────────────────

        // ZeroTrue es síncrono — enviamos y recibimos el resultado en una sola llamada
        console.log('[Analysis] Enviando a ZeroTrue...');
        const ztResult = await sendToDeepfake(fileUrl);
        const { score, trust, details } = await processZeroTrueResult(ztResult, req.userId);

        const analysisId = ztResult.analysisId;

        // Guardar registro completo inmediatamente (no hay polling)
        await saveAnalysisRecord({
            userId:           req.userId || null,
            fileUrl,
            fileName:         fileName || null,
            faciaReferenceId: analysisId,
            verdict:          trust.verdict,
            isDeepfake:       trust.isDeepfake,
            confidence:       typeof score === 'number' ? (score * 100).toFixed(2) : null,
            manipulationIndex: trust.manipulationIndex,
            riskLevel:        trust.riskLevel,
            trustScore:       trust.trustScore,
            interpretedLabel: trust.interpretedLabel,
            explanation:      trust.explanation,
            recommendations:  trust.recommendations,
            analysisCategory: trust.analysisCategory,
            isInconclusive:   trust.isInconclusive,
            isGreyZone:       trust.isGreyZone,
            faciaResponse:    details,   // guardamos el raw de ZeroTrue en el mismo campo
            ...(fileHash ? { fileHash } : {}),
        }).catch(err => console.error('Error guardando registro:', err));

        // Guardar en caché
        if (fileHash) {
            FileCache.findOneAndUpdate(
                { fileHash },
                {
                    fileHash, faciaReferenceId: analysisId,
                    verdict: trust.verdict, isDeepfake: trust.isDeepfake,
                    riskLevel: trust.riskLevel, trustScore: trust.trustScore,
                    manipulationIndex: trust.manipulationIndex,
                    interpretedLabel: trust.interpretedLabel,
                    explanation: trust.explanation, recommendations: trust.recommendations,
                    analysisCategory: trust.analysisCategory,
                    isInconclusive: trust.isInconclusive, isGreyZone: trust.isGreyZone,
                    isSuspicious: trust.isSuspicious || false,
                    confidence: typeof score === 'number' ? (score * 100).toFixed(2) : null,
                },
                { upsert: true, new: true }
            ).catch(err => console.error('Error guardando en caché:', err));
        }

        // ZeroTrue es síncrono → devolvemos resultado completo de una vez
        return res.status(200).json({
            success:    true,
            analysisId,
            fromCache:  false,
            status:     'completed',
            processing: false,
            message:    'Análisis completado correctamente.',
            result: {
                analysisId,
                timestamp:         new Date().toISOString(),
                mediaType:         ztResult.mediaType,
                deepfake_score:    score,
                hasFace:           ztResult.hasFace,
                // UI fields — TrustAnalysisEngine v4
                verdict:           trust.verdict,
                isDeepfake:        trust.isDeepfake,
                isAuthentic:       !trust.isDeepfake,
                isInconclusive:    trust.isInconclusive,
                isGreyZone:        trust.isGreyZone,
                isSuspicious:      trust.isSuspicious,
                invalidCase:       trust.invalidCase,
                riskLevel:         trust.riskLevel,
                trustScore:        trust.trustScore,
                manipulationIndex: trust.manipulationIndex,
                interpretedLabel:  trust.interpretedLabel,
                explanation:       trust.explanation,
                recommendations:   trust.recommendations,
                analysisCategory:  trust.analysisCategory,
                recidivism:        trust.recidivism,
                // Detalle del proveedor (para debug, no exponer en frontend)
                _providerDetails:  details,
            },
        });

    } catch (error) {
        console.error('Error startAnalysis:', error);

        let errorMessage = 'Error interno del servidor';
        let statusCode   = 500;

        if (error.message.includes('ZEROTRUE_API_KEY'))    { errorMessage = 'Servicio de análisis no configurado.'; statusCode = 503; }
        else if (error.message.includes('Key inválida'))   { errorMessage = 'Error de autenticación con el servicio de análisis.'; statusCode = 503; }
        else if (error.message.includes('límite'))         { errorMessage = 'Límite de análisis alcanzado. Intenta en unos minutos.'; statusCode = 429; }
        else if (error.message.includes('compatible'))     { errorMessage = 'El archivo no es compatible para análisis.'; statusCode = 422; }
        else if (error.message.includes('S3'))             { errorMessage = 'No se pudo acceder al archivo.'; statusCode = 404; }

        return res.status(statusCode).json({ success: false, error: errorMessage });
    }
};

// ─── getAnalysisResult (ahora consulta MongoDB, no ZeroTrue) ─────────────────
/**
 * Como ZeroTrue es síncrono, ya no necesitamos polling.
 * Esta función busca el resultado en MongoDB usando el analysisId.
 * Se mantiene para compatibilidad con el frontend existente.
 */
export const getAnalysisResult = async (req, res) => {
    try {
        const { referenceId } = req.body;
        if (!referenceId) return res.status(400).json({ success: false, error: 'referenceId requerido' });

        const record = await Analysis.findOne({ faciaReferenceId: referenceId });

        if (!record) {
            return res.status(404).json({ success: false, error: 'Análisis no encontrado' });
        }

        const isComplete = record.verdict !== 'processing';

        if (!isComplete) {
            return res.status(202).json({
                success: true, processing: true,
                message: 'El análisis aún está en proceso.',
                result: { analysisId: referenceId, status: 'processing' },
            });
        }

        return res.status(200).json({
            success: true, processing: false, fromCache: false,
            result: {
                analysisId:        record.faciaReferenceId,
                timestamp:         record.createdAt,
                mediaType:         record.faciaResponse?.mediaType || null,
                deepfake_score:    parseFloat(record.confidence) / 100 || null,
                verdict:           record.verdict,
                isDeepfake:        record.isDeepfake,
                isAuthentic:       !record.isDeepfake,
                isInconclusive:    record.isInconclusive,
                isGreyZone:        record.isGreyZone,
                isSuspicious:      record.isSuspicious || false,
                riskLevel:         record.riskLevel,
                trustScore:        record.trustScore,
                manipulationIndex: record.manipulationIndex,
                interpretedLabel:  record.interpretedLabel,
                explanation:       record.explanation,
                recommendations:   record.recommendations,
                analysisCategory:  record.analysisCategory,
            },
        });

    } catch (error) {
        console.error('Error getAnalysisResult:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo resultado del análisis' });
    }
};

// ─── checkAnalysisStatus (busca en MongoDB) ───────────────────────────────────
export const checkAnalysisStatus = async (req, res) => {
    try {
        const { referenceId } = req.params;
        if (!referenceId) return res.status(400).json({ success: false, error: 'referenceId requerido' });

        const record     = await Analysis.findOne({ faciaReferenceId: referenceId });
        const isComplete = record && record.verdict !== 'processing';

        let computed = null;
        if (isComplete) {
            computed = {
                verdict:           record.verdict,
                isDeepfake:        record.isDeepfake,
                isInconclusive:    record.isInconclusive,
                isGreyZone:        record.isGreyZone,
                isSuspicious:      record.isSuspicious || false,
                manipulationIndex: record.manipulationIndex,
                riskLevel:         record.riskLevel,
                trustScore:        record.trustScore,
                interpretedLabel:  record.interpretedLabel,
                explanation:       record.explanation,
                recommendations:   record.recommendations,
            };
        }

        return res.status(200).json({
            success: true, analysisId: referenceId,
            status: isComplete ? 'completed' : 'processing',
            isComplete, result: computed,
        });

    } catch (error) {
        console.error('Error checkAnalysisStatus:', error);
        return res.status(500).json({ success: false, error: 'Error verificando estado' });
    }
};
