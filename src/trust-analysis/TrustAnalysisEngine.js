/**
 * TrustAnalysisEngine
 * Componente propio que interpreta el score de Facia AI
 * y genera un resultado enriquecido con nivel de riesgo,
 * explicación amigable, recomendaciones y detección de reincidencia.
 */

import Analysis from "../models/analysis.model.js";

// ─── Umbrales de riesgo ───────────────────────────────────────────────────────
const THRESHOLDS = {
    RELIABLE:    { min: 0.00, max: 0.30 },  // Confiable
    SUSPICIOUS:  { min: 0.31, max: 0.60 },  // Sospechoso
    HIGH_RISK:   { min: 0.61, max: 0.80 },  // Alto riesgo
    CRITICAL:    { min: 0.81, max: 1.00 },  // Crítico
};

// Cuántos análisis sospechosos/fake en los últimos N días = reincidente
const RECIDIVISM_WINDOW_DAYS = 30;
const RECIDIVISM_THRESHOLD   = 3;

// ─── Clasificador de riesgo ───────────────────────────────────────────────────
function classifyRisk(score) {
    if (score <= THRESHOLDS.RELIABLE.max)   return "LOW";
    if (score <= THRESHOLDS.SUSPICIOUS.max) return "MEDIUM";
    if (score <= THRESHOLDS.HIGH_RISK.max)  return "HIGH";
    return "CRITICAL";
}

// ─── Etiqueta interpretada ────────────────────────────────────────────────────
function getInterpretedLabel(riskLevel, evasionAttack) {
    if (evasionAttack) return "Intento de evasión detectado";
    const labels = {
        LOW:      "Contenido auténtico",
        MEDIUM:   "Contenido sospechoso",
        HIGH:     "Posible deepfake",
        CRITICAL: "Deepfake confirmado",
    };
    return labels[riskLevel];
}

// ─── Explicación amigable ─────────────────────────────────────────────────────
function getExplanation(score, riskLevel, evasionAttack, fileType) {
    const pct = Math.round(score * 100);
    const tipo = fileType === "video" ? "video" : "imagen";

    if (evasionAttack) {
        return `El sistema detectó un intento de evasión en esta ${tipo}. ` +
            `Esto puede indicar manipulación deliberada para engañar al detector.`;
    }

    const explanations = {
        LOW:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, ` +
            `lo cual se encuentra dentro del rango normal. ` +
            `El contenido aparenta ser auténtico.`,
        MEDIUM:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, ` +
            `lo cual es moderadamente elevado. ` +
            `Pueden existir alteraciones menores o características ambiguas.`,
        HIGH:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, ` +
            `lo que indica alta probabilidad de edición digital o generación artificial.`,
        CRITICAL:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, ` +
            `lo que indica con alta certeza que el contenido fue generado o ` +
            `manipulado digitalmente mediante inteligencia artificial.`,
    };
    return explanations[riskLevel];
}

// ─── Recomendaciones ──────────────────────────────────────────────────────────
function getRecommendations(riskLevel, evasionAttack) {
    if (evasionAttack) {
        return [
            "No compartas este contenido sin verificación adicional.",
            "Consulta con un experto en análisis forense digital.",
            "Reporta el contenido si proviene de una fuente sospechosa.",
        ];
    }

    const recs = {
        LOW: [
            "El contenido parece auténtico, pero mantén buenas prácticas de verificación.",
            "Considera la fuente original antes de compartir.",
        ],
        MEDIUM: [
            "Verifica la fuente original del contenido antes de compartirlo.",
            "Busca otras versiones o referencias del mismo contenido.",
            "Sé cauteloso al usar este material en contextos importantes.",
        ],
        HIGH: [
            "No compartas este contenido sin verificación adicional.",
            "Consulta fuentes oficiales para confirmar la autenticidad.",
            "Informa a otros sobre la posible manipulación.",
            "Evita usar este contenido en decisiones importantes.",
        ],
        CRITICAL: [
            "No compartas este contenido bajo ninguna circunstancia sin verificarlo.",
            "Reporta el contenido si fue recibido por canales no confiables.",
            "Consulta con un experto en análisis forense digital.",
            "Este material no debe usarse como evidencia o referencia.",
        ],
    };
    return recs[riskLevel];
}

// ─── Trust Score (inverso del riesgo, 0-100) ─────────────────────────────────
function computeTrustScore(score) {
    return Math.round((1 - score) * 100);
}

// ─── Detección de reincidencia ────────────────────────────────────────────────
async function detectRecidivism(userId) {
    if (!userId) return { isRecidivist: false, count: 0 };

    const since = new Date();
    since.setDate(since.getDate() - RECIDIVISM_WINDOW_DAYS);

    const count = await Analysis.countDocuments({
        userId,
        createdAt: { $gte: since },
        riskLevel: { $in: ["HIGH", "CRITICAL"] },
    });

    return {
        isRecidivist: count >= RECIDIVISM_THRESHOLD,
        count,
        message: count >= RECIDIVISM_THRESHOLD
            ? `Este usuario ha subido ${count} contenidos de alto riesgo en los últimos ${RECIDIVISM_WINDOW_DAYS} días.`
            : null,
    };
}

// ─── Motor principal ──────────────────────────────────────────────────────────
/**
 * @param {object} params
 * @param {number}  params.score          - deepfake_score de Facia (0-1)
 * @param {boolean} params.evasionAttack  - true si decline_code === "FADR07"
 * @param {string}  params.fileType       - "image" | "video"
 * @param {string}  [params.userId]       - para detección de reincidencia
 */
export async function analyze({ score, evasionAttack = false, fileType = "image", userId = null, faciaStatus = null }) {
    const riskLevel       = classifyRisk(score);
    const trustScore      = computeTrustScore(score);
    const interpretedLabel = getInterpretedLabel(riskLevel, evasionAttack);
    const explanation     = getExplanation(score, riskLevel, evasionAttack, fileType);
    const recommendations = getRecommendations(riskLevel, evasionAttack);
    const recidivism      = await detectRecidivism(userId);
    const isDeepfake = (riskLevel === "HIGH" || riskLevel === "CRITICAL")
                                && (faciaStatus === null || faciaStatus === 0);
    const verdict         = isDeepfake ? "FAKE" : "REAL";
    const analysisCategory = evasionAttack ? "evasion" : "deepfake";

    return {
        verdict,
        isDeepfake,
        riskLevel,
        trustScore,
        interpretedLabel,
        explanation,
        recommendations,
        analysisCategory,
        recidivism,
    };
}