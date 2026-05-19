/**
 * TrustAnalysisEngine v4
 *
 * CAMBIOS RESPECTO A v3:
 * ──────────────────────────────────────────────────────────────────────────────
 * 1. Thresholds DINÁMICOS por tipo de media:
 *    - Video → más estricto (umbral HIGH baja a 0.65, CRITICAL a 0.85)
 *    - Imagen → umbrales normales (igual que v3)
 *
 * 2. Nueva zona SUSPICIOUS (score 0.45–0.65):
 *    - Antes caía en MEDIUM o HIGH sin distinción
 *    - Ahora tiene su propio label, explicación y recomendaciones
 *    - Evita falsos positivos en contenido de redes sociales comprimido
 *
 * 3. Diferenciación por presencia de rostro (hasFace):
 *    - Con rostro → análisis deepfake completo (comportamiento normal)
 *    - Sin rostro → modo "contenido IA" (animales, paisajes, arte generado)
 *
 * 4. Compatibilidad total con v3: misma interfaz de entrada/salida.
 *    El controller NO necesita cambios de contrato.
 */

import Analysis from "../models/analysis.model.js";

// ─── Thresholds dinámicos ─────────────────────────────────────────────────────
function getThresholds(mediaType) {
    if (mediaType === 'video') {
        return {
            LOW:            0.25,
            MEDIUM:         0.45,
            SUSPICIOUS_MIN: 0.45,
            SUSPICIOUS_MAX: 0.60,
            HIGH:           0.75,
            CRITICAL:       1.00,
        };
    }
    return {
        LOW:            0.30,
        MEDIUM:         0.45,
        SUSPICIOUS_MIN: 0.45,
        SUSPICIOUS_MAX: 0.65,
        HIGH:           0.80,
        CRITICAL:       1.00,
    };
}

const GREY_ZONE_MAX = 0.72;
const RECIDIVISM_WINDOW_DAYS = 30;
const RECIDIVISM_THRESHOLD   = 3;

const FACIA_INVALID_CODES = {
    FADR01: "No se detectó un rostro humano en el contenido.",
    FADR02: "Se detectaron múltiples rostros. Sube una imagen con un solo rostro.",
    FADR03: "El rostro detectado es demasiado pequeño para analizarse.",
    FADR04: "La imagen está borrosa. Sube una imagen más nítida.",
    FADR05: "Iluminación insuficiente para el análisis.",
    FADR06: "El rostro está parcialmente oculto o recortado.",
    FADR08: "El contenido no fue capturado en vivo.",
    FADR09: "La calidad de la imagen es insuficiente para el análisis.",
    FADR10: "El ángulo del rostro es demasiado extremo.",
};

function classifyRisk(score, thresholds) {
    if (score <= thresholds.LOW)    return 'LOW';
    if (score <= thresholds.MEDIUM) return 'MEDIUM';
    if (score >= thresholds.SUSPICIOUS_MIN && score <= thresholds.SUSPICIOUS_MAX) return 'SUSPICIOUS';
    if (score <= thresholds.HIGH)   return 'HIGH';
    return 'CRITICAL';
}

function detectInvalidCase(declineCode) {
    if (!declineCode || !FACIA_INVALID_CODES[declineCode]) return null;
    return { isInvalid: true, code: declineCode, reason: FACIA_INVALID_CODES[declineCode] };
}

function isGreyZone(score, riskLevel) {
    return riskLevel === 'HIGH' && score <= GREY_ZONE_MAX;
}

function getInterpretedLabel({ riskLevel, evasionAttack, invalidCase, greyZone, hasFace }) {
    if (invalidCase)   return 'Análisis no concluyente';
    if (evasionAttack) {
        return (riskLevel === 'HIGH' || riskLevel === 'CRITICAL')
            ? 'Contenido falso detectado'
            : 'Resultado no concluyente';
    }
    if (greyZone) return 'Resultado incierto — verificar manualmente';

    if (!hasFace) {
        return {
            LOW:        'Contenido aparentemente original',
            MEDIUM:     'Contenido posiblemente generado por IA',
            SUSPICIOUS: 'Contenido con indicios de generación artificial',
            HIGH:       'Contenido probablemente generado por IA',
            CRITICAL:   'Contenido generado por IA confirmado',
        }[riskLevel];
    }

    return {
        LOW:        'Contenido auténtico',
        MEDIUM:     'Contenido posiblemente auténtico',
        SUSPICIOUS: 'Resultado sospechoso — no concluyente',
        HIGH:       'Posible deepfake',
        CRITICAL:   'Deepfake confirmado',
    }[riskLevel];
}

function getExplanation({ score, riskLevel, evasionAttack, mediaType, invalidCase, greyZone, hasFace }) {
    const pct  = Math.round(score * 100);
    const tipo = mediaType === 'video' ? 'video' : 'imagen';

    if (invalidCase) {
        return `No se pudo determinar con certeza si este contenido es auténtico o manipulado. ` +
            `Motivo: ${invalidCase.reason} ` +
            `El índice de manipulación registrado fue del ${pct}%, pero este valor no es confiable.`;
    }
    if (evasionAttack) {
        return `El sistema detectó que este contenido intentó evadir la detección, ` +
            `lo cual es una señal clara de manipulación digital. ` +
            `El índice de manipulación base fue del ${pct}%.`;
    }
    if (greyZone) {
        return `Esta ${tipo} presenta un índice de manipulación del ${pct}%, en zona de incertidumbre. ` +
            `Puede deberse a compresión de redes sociales, capturas de pantalla, o iluminación artificial. ` +
            `El resultado no es concluyente — verifica el origen del contenido.`;
    }

    if (riskLevel === 'SUSPICIOUS') {
        if (!hasFace) {
            return `Esta ${tipo} presenta un índice de ${pct}%, en una zona de incertidumbre. ` +
                `No se detectó un rostro humano — el análisis evalúa si el contenido fue generado ` +
                `artificialmente (IA). El resultado no es definitivo — se recomienda verificar la fuente.`;
        }
        return `Esta ${tipo} presenta un índice de manipulación del ${pct}%, en la zona gris ` +
            `entre contenido auténtico y manipulado. Puede deberse a filtros, compresión agresiva ` +
            `de plataformas como WhatsApp o TikTok, o ediciones menores. ` +
            `No es suficiente para confirmar un deepfake — verifica la fuente.`;
    }

    if (!hasFace) {
        return {
            LOW:
                `Esta ${tipo} presenta un índice de ${pct}%, dentro del rango esperado para contenido original. ` +
                `No se detectó un rostro humano — el análisis evaluó características generales de generación artificial.`,
            MEDIUM:
                `Esta ${tipo} presenta un índice de ${pct}%. No se detectó un rostro humano. ` +
                `El contenido podría haber sido generado o modificado con herramientas de IA. ` +
                `Se recomienda verificar su procedencia.`,
            HIGH:
                `Esta ${tipo} presenta un índice de ${pct}%, indicando alta probabilidad de haber sido ` +
                `generado por inteligencia artificial. No se detectó un rostro humano — puede tratarse de ` +
                `imágenes de animales, paisajes o arte generado por IA.`,
            CRITICAL:
                `Esta ${tipo} presenta un índice de ${pct}%, lo que indica con alta certeza que el contenido ` +
                `fue generado digitalmente mediante inteligencia artificial.`,
        }[riskLevel];
    }

    return {
        LOW:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, dentro del rango normal. ` +
            `El contenido aparenta ser auténtico.`,
        MEDIUM:
            `Esta ${tipo} presenta un índice de manipulación del ${pct}%, moderadamente elevado. ` +
            `Pueden existir alteraciones menores o compresión de plataformas digitales. ` +
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

function getRecommendations({ riskLevel, evasionAttack, invalidCase, greyZone, hasFace }) {
    if (invalidCase) return [
        'El resultado no es confiable para este tipo de contenido.',
        'Para mejores resultados, sube una imagen clara con un rostro humano frontal y visible.',
        'Si el contenido no tiene personas, esta herramienta puede no ser la más adecuada.',
        'Considera verificar el origen del contenido por otros medios.',
    ];
    if (evasionAttack) return [
        'No compartas este contenido sin verificación adicional.',
        'Consulta con un experto en análisis forense digital.',
        'Reporta el contenido si proviene de una fuente sospechosa.',
    ];
    if (greyZone) return [
        'El resultado está en zona de incertidumbre — no es definitivo.',
        'Imágenes de redes sociales pueden dar resultados imprecisos por compresión.',
        'Verifica si el rostro es el sujeto principal y está completamente visible.',
        'Busca la fuente original del contenido para una verificación más precisa.',
    ];
    if (riskLevel === 'SUSPICIOUS') return [
        'El resultado no es concluyente — no confirma ni descarta manipulación.',
        'Verifica si el contenido proviene de una fuente conocida y confiable.',
        'Imágenes con filtros, stickers o capturadas de pantalla pueden dar este resultado.',
        hasFace
            ? 'Si el rostro no es el sujeto principal, considera subir otra versión.'
            : 'Busca el origen original del contenido antes de compartirlo.',
        'Usa herramientas adicionales de verificación si la decisión es importante.',
    ];

    return {
        LOW: [
            'El contenido parece auténtico, pero mantén buenas prácticas de verificación.',
            'Considera la fuente original antes de compartir.',
        ],
        MEDIUM: [
            'Verifica la fuente original antes de compartirlo.',
            'Busca otras versiones o referencias del mismo contenido.',
            'Sé cauteloso al usar este material en contextos importantes.',
        ],
        HIGH: [
            'Verifica el origen original del contenido antes de compartirlo.',
            hasFace
                ? 'Si el rostro no es el sujeto principal, el resultado puede no ser preciso.'
                : 'El contenido podría ser generado por IA — busca la fuente original.',
            'Consulta fuentes oficiales si necesitas confirmar la autenticidad.',
            'Considera reportarlo si proviene de canales sospechosos.',
        ],
        CRITICAL: [
            'No compartas este contenido bajo ninguna circunstancia sin verificarlo.',
            'Reporta el contenido si fue recibido por canales no confiables.',
            'Consulta con un experto en análisis forense digital.',
            'Este material no debe usarse como evidencia o referencia.',
        ],
    }[riskLevel] || [];
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
        riskLevel: { $in: ['HIGH', 'CRITICAL'] },
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
                                  mediaType      = 'image',
                                  hasFace        = true,
                                  evasionAttack  = false,
                                  userId         = null,
                                  declineCode    = null,
                                  faciaStatus    = null,
                                  // Aliases de compatibilidad con v3
                                  fileType,
                              }) {
    // fileType era el nombre en v3 — lo mapeamos transparentemente
    const resolvedMediaType = fileType || mediaType;

    const thresholds        = getThresholds(resolvedMediaType);
    const riskLevel         = classifyRisk(score, thresholds);
    const invalidCase       = detectInvalidCase(declineCode);
    const greyZone          = isGreyZone(score, riskLevel);
    const trustScore        = computeTrustScore(score);
    const manipulationIndex = Math.round(score * 100);
    const recidivism        = await detectRecidivism(userId);

    const ctx = { riskLevel, evasionAttack, invalidCase, greyZone, hasFace, score, mediaType: resolvedMediaType };

    const interpretedLabel = getInterpretedLabel(ctx);
    const explanation      = getExplanation(ctx);
    const recommendations  = getRecommendations(ctx);

    const analysisCategory = evasionAttack
        ? 'evasion'
        : invalidCase
            ? 'invalid'
            : (greyZone || riskLevel === 'SUSPICIOUS')
                ? 'uncertain'
                : hasFace
                    ? 'deepfake'
                    : 'ai-generated';

    const isDeepfake = evasionAttack
        ? (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') && (faciaStatus === null || faciaStatus === 0)
        : invalidCase || greyZone || riskLevel === 'SUSPICIOUS'
            ? false
            : (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') && (faciaStatus === null || faciaStatus === 0);

    const verdict = isDeepfake ? 'FAKE' : 'REAL';

    return {
        verdict,
        isDeepfake,
        isInconclusive:  !!invalidCase || greyZone || riskLevel === 'SUSPICIOUS',
        isGreyZone:      greyZone,
        isSuspicious:    riskLevel === 'SUSPICIOUS',
        hasFace,
        invalidCase,
        riskLevel,
        trustScore,
        manipulationIndex,
        interpretedLabel,
        explanation,
        recommendations,
        analysisCategory,
        recidivism,
        _meta: { mediaType: resolvedMediaType, engineVersion: 'v4' },
    };
}
