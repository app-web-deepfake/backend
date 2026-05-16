/**
 * TrustAnalysisEngine v3
 * - Umbrales calibrados por zona de riesgo
 * - Detección de casos inválidos (sin rostro, oclusión, compresión)
 * - Textos no tajantes en zona gris (HIGH con score < 0.80)
 * - "Índice de manipulación" en vez de "Confianza" para claridad
 * - Flag isLowConfidenceZone para advertir al usuario
 */

import Analysis from "../models/analysis.model.js";

// ─── Umbrales ─────────────────────────────────────────────────────────────────
const THRESHOLDS = {
    LOW:      { max: 0.30 },
    MEDIUM:   { max: 0.60 },
    HIGH:     { max: 0.80 },
    CRITICAL: { max: 1.00 },
};

// Zona gris: HIGH pero cerca del límite inferior — más probable falso positivo
const GREY_ZONE_MAX = 0.72;

const RECIDIVISM_WINDOW_DAYS = 30;
const RECIDIVISM_THRESHOLD   = 3;

// ─── Códigos de Facia que indican caso inválido ───────────────────────────────
const INVALID_CASE_CODES = {
    FADR01: "No se detectó un rostro humano en el contenido.",
    FADR02: "Se detectaron múltiples rostros. Sube una imagen con un solo rostro.",
    FADR03: "El rostro detectado es demasiado pequeño para analizarse.",
    FADR04: "La imagen está borrosa. Sube una imagen más nítida.",
    FADR05: "Iluminación insuficiente para el análisis.",
    FADR06: "El rostro está parcialmente oculto o recortado.",
    FADR08: "El contenido no fue capturado en vivo. Facia está optimizado para selfies o videos directos de cámara.",
    FADR09: "La calidad de la imagen es insuficiente para el análisis.",
    FADR10: "El ángulo del rostro es demasiado extremo.",
};

function classifyRisk(score) {
    if (score <= THRESHOLDS.LOW.max)    return "LOW";
    if (score <= THRESHOLDS.MEDIUM.max) return "MEDIUM";
    if (score <= THRESHOLDS.HIGH.max)   return "HIGH";
    return "CRITICAL";
}

function detectInvalidCase(declineCode) {
    if (!declineCode || !INVALID_CASE_CODES[declineCode]) return null;
    return { isInvalid: true, code: declineCode, reason: INVALID_CASE_CODES[declineCode] };
}

// ─── Zona gris: HIGH pero score bajo o cara parcial ──────────────────────────
function isGreyZone(score, riskLevel) {
    return riskLevel === "HIGH" && score <= GREY_ZONE_MAX;
}

function getInterpretedLabel(riskLevel, evasionAttack, invalidCase, greyZone) {
    if (invalidCase)   return "Análisis no concluyente";
    if (evasionAttack) {
        return (riskLevel === "HIGH" || riskLevel === "CRITICAL")
            ? "Contenido falso detectado"
            : "Resultado no concluyente";  // evasión pero score bajo = no sabemos
    }    if (greyZone)      return "Resultado incierto — verificar manualmente";
    return {
        LOW:      "Contenido auténtico",
        MEDIUM:   "Contenido posiblemente auténtico",
        HIGH:     "Posible deepfake",
        CRITICAL: "Deepfake confirmado",
    }[riskLevel];
}

function getExplanation(score, riskLevel, evasionAttack, fileType, invalidCase, greyZone) {
    const pct  = Math.round(score * 100);
    const tipo = fileType === "video" ? "video" : "imagen";

    if (invalidCase) {
        return `No se pudo determinar con certeza si este contenido es auténtico o manipulado. ` +
            `Motivo: ${invalidCase.reason} ` +
            `El índice de manipulación registrado fue del ${pct}%, pero este valor no es confiable para este tipo de contenido.`;
    }
    if (evasionAttack) {
        return `El sistema detectó que este contenido intentó evadir la detección, ` +
            `lo cual es una señal clara de manipulación digital. ` +
            `El índice de manipulación base fue del ${pct}%.`;
    }
    if (greyZone) {
        return `Esta ${tipo} presenta un índice de manipulación del ${pct}%, lo que está en una zona de incertidumbre. ` +
            `Esto puede deberse a compresión de redes sociales (TikTok, Instagram, WhatsApp), ` +
            `capturas de pantalla, rostros parcialmente visibles, o iluminación artificial. ` +
            `El resultado no es concluyente — se recomienda verificar el origen del contenido antes de sacar conclusiones.`;
    }
    return {
        LOW:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, dentro del rango normal. ` +
            `El contenido aparenta ser auténtico.`,
        MEDIUM:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, moderadamente elevado. ` +
            `Pueden existir alteraciones menores, compresión de plataformas digitales, o características ambiguas. ` +
            `Se recomienda verificar el origen.`,
        HIGH:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, lo que indica alta probabilidad ` +
            `de edición digital o generación artificial. Sin embargo, factores como compresión severa ` +
            `o rostros parciales pueden influir en este resultado.`,
        CRITICAL:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, lo que indica con alta certeza ` +
            `que el contenido fue generado o manipulado digitalmente mediante inteligencia artificial.`,
    }[riskLevel];
}

function getRecommendations(riskLevel, evasionAttack, invalidCase, greyZone) {
    if (invalidCase) return [
        "El resultado no es confiable para este tipo de contenido.",
        "Para mejores resultados, sube una imagen clara con un rostro humano frontal y visible.",
        "Si el contenido no tiene personas, esta herramienta puede no ser la más adecuada.",
        "Considera verificar el origen del contenido por otros medios.",
    ];
    if (evasionAttack) return [
        "No compartas este contenido sin verificación adicional.",
        "Consulta con un experto en análisis forense digital.",
        "Reporta el contenido si proviene de una fuente sospechosa.",
    ];
    if (greyZone) return [
        "El resultado está en zona de incertidumbre — no es definitivo.",
        "Imágenes de redes sociales pueden dar resultados imprecisos por compresión.",
        "Verifica si el rostro es el sujeto principal y está completamente visible.",
        "Busca la fuente original del contenido para una verificación más precisa.",
        "Considera subir una versión de mayor calidad si la tienes disponible.",
    ];
    return {
        LOW: [
            "El contenido parece auténtico, pero mantén buenas prácticas de verificación.",
            "Considera la fuente original antes de compartir.",
        ],
        MEDIUM: [
            "Verifica la fuente original antes de compartirlo.",
            "Busca otras versiones o referencias del mismo contenido.",
            "Sé cauteloso al usar este material en contextos importantes.",
        ],
        HIGH: [
            "Verifica el origen original del contenido antes de compartirlo.",
            "Ten en cuenta que imágenes de redes sociales pueden dar resultados imprecisos por compresión.",
            "Si el rostro no es el sujeto principal, el resultado puede no ser preciso.",
            "Consulta fuentes oficiales si necesitas confirmar la autenticidad.",
        ],
        CRITICAL: [
            "No compartas este contenido bajo ninguna circunstancia sin verificarlo.",
            "Reporta el contenido si fue recibido por canales no confiables.",
            "Consulta con un experto en análisis forense digital.",
            "Este material no debe usarse como evidencia o referencia.",
        ],
    }[riskLevel];
}

function computeTrustScore(score) {
    return Math.round((1 - score) * 100);
}

async function detectRecidivism(userId) {
    if (!userId) return { isRecidivist: false, count: 0 };
    const since = new Date();
    since.setDate(since.getDate() - RECIDIVISM_WINDOW_DAYS);
    const count = await Analysis.countDocuments({
        userId,
        createdAt: { $gte: since },
        riskLevel:  { $in: ["HIGH", "CRITICAL"] },
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
export async function analyze({
                                  score,
                                  evasionAttack = false,
                                  fileType      = "image",
                                  userId        = null,
                                  faciaStatus   = null,
                                  declineCode   = null,
                              }) {
    const invalidCase  = detectInvalidCase(declineCode);
    const riskLevel    = classifyRisk(score);
    const greyZone     = isGreyZone(score, riskLevel);
    const trustScore   = computeTrustScore(score);
    const manipulationIndex = Math.round(score * 100); // "Índice de manipulación" en vez de "Confianza"
    const recidivism   = await detectRecidivism(userId);

    const interpretedLabel = getInterpretedLabel(riskLevel, evasionAttack, invalidCase, greyZone);
    const explanation      = getExplanation(score, riskLevel, evasionAttack, fileType, invalidCase, greyZone);
    const recommendations  = getRecommendations(riskLevel, evasionAttack, invalidCase, greyZone);
    const analysisCategory = evasionAttack ? "evasion" : invalidCase ? "invalid" : greyZone ? "uncertain" : "deepfake";

    const isDeepfake = evasionAttack
        // Evasión solo es FAKE si el score también es alto
        ? (riskLevel === "HIGH" || riskLevel === "CRITICAL") && (faciaStatus === null || faciaStatus === 0)
        : invalidCase || greyZone
            ? false
            : (riskLevel === "HIGH" || riskLevel === "CRITICAL") && (faciaStatus === null || faciaStatus === 0);

    const verdict = isDeepfake ? "FAKE" : "REAL";

    return {
        verdict,
        isDeepfake,
        isInconclusive:    !!invalidCase || greyZone,  // para mostrar aviso en frontend
        isGreyZone:        greyZone,
        invalidCase,
        riskLevel,
        trustScore,
        manipulationIndex,   // reemplaza "confidence" en la UI
        interpretedLabel,
        explanation,
        recommendations,
        analysisCategory,
        recidivism,
    };
}