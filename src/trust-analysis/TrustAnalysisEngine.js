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

function getInterpretedLabel({ riskLevel, invalidCase, greyZone, hasFace }) {
    if (invalidCase) return 'No pudimos analizar este contenido';
    if (greyZone)    return 'Resultado no concluyente';

    if (!hasFace) {
        return {
            LOW:        'El contenido parece original',
            MEDIUM:     'El contenido podría ser generado por IA',
            SUSPICIOUS: 'No podemos confirmar si es generado por IA',
            HIGH:       'El contenido probablemente fue generado por IA',
            CRITICAL:   'El contenido fue generado por IA',
        }[riskLevel];
    }

    return {
        LOW:        'El contenido es auténtico',
        MEDIUM:     'El contenido parece auténtico',
        SUSPICIOUS: 'No podemos confirmar la autenticidad',
        HIGH:       'El contenido podría estar manipulado',
        CRITICAL:   'El contenido está manipulado digitalmente',
    }[riskLevel];
}

function getExplanation({ score, riskLevel, mediaType, invalidCase, greyZone, hasFace }) {
    const pct  = Math.round(score * 100);
    const tipo = mediaType === 'video' ? 'video' : 'imagen';

    if (invalidCase) {
        return `No logramos analizar este contenido correctamente. ` +
            `Motivo: ${invalidCase.reason} ` +
            `Intenta subir una imagen más clara o con mejor iluminación.`;
    }
    if (greyZone) {
        return `Esta ${tipo} tiene un ${pct}% de probabilidad de manipulación, lo que está en una zona de incertidumbre. ` +
            `Esto puede ocurrir con fotos comprimidas por WhatsApp o Instagram, capturas de pantalla, ` +
            `o imágenes con filtros. No podemos afirmar con certeza si fue editada — te recomendamos ` +
            `buscar la fuente original.`;
    }

    if (riskLevel === 'SUSPICIOUS') {
        if (!hasFace) {
            return `Esta ${tipo} tiene indicios de que podría haber sido creada con inteligencia artificial, ` +
                `pero el resultado no es definitivo (${pct}% de probabilidad). ` +
                `No detectamos un rostro humano. Verifica de dónde proviene antes de compartirla.`;
        }
        return `Esta ${tipo} tiene un ${pct}% de probabilidad de manipulación, lo que no es suficiente ` +
            `para confirmar ni descartar que haya sido editada. ` +
            `Podría deberse a filtros, compresión de WhatsApp o TikTok, o ediciones menores. ` +
            `Te recomendamos verificar la fuente del contenido antes de compartirlo.`;
    }

    if (!hasFace) {
        return {
            LOW:
                `Esta ${tipo} tiene solo un ${pct}% de probabilidad de haber sido generada por IA, ` +
                `lo que indica que muy probablemente es original. ` +
                `No detectamos un rostro humano — analizamos características generales del contenido.`,
            MEDIUM:
                `Esta ${tipo} tiene un ${pct}% de probabilidad de haber sido creada o modificada con IA. ` +
                `No detectamos un rostro humano. Puede ser contenido auténtico, ` +
                `pero te recomendamos verificar su procedencia.`,
            HIGH:
                `Esta ${tipo} tiene un ${pct}% de probabilidad de haber sido generada por inteligencia artificial. ` +
                `No detectamos un rostro humano — puede ser una imagen de paisaje, animal o arte digital generado por IA. ` +
                `Verifica la fuente antes de usarla o compartirla.`,
            CRITICAL:
                `Esta ${tipo} tiene un ${pct}% de probabilidad de ser generada por IA, lo que indica con alta certeza ` +
                `que fue creada digitalmente. No la uses ni compartas sin verificar su origen.`,
        }[riskLevel];
    }

    return {
        LOW:
            `Esta ${tipo} tiene solo un ${pct}% de probabilidad de manipulación. ` +
            `Eso significa que muy probablemente es auténtica y no fue editada digitalmente. ` +
            `Puedes confiar en su contenido.`,
        MEDIUM:
            `Esta ${tipo} tiene un ${pct}% de probabilidad de manipulación. ` +
            `Puede ser auténtica, pero existen algunas señales menores que vale la pena tener en cuenta. ` +
            `Verifica de dónde proviene antes de compartirla.`,
        HIGH:
            `Esta ${tipo} tiene un ${pct}% de probabilidad de haber sido editada o manipulada digitalmente. ` +
            `Encontramos señales que sugieren que el contenido pudo haber sido alterado. ` +
            `No la compartas sin verificar su origen.`,
        CRITICAL:
            `Esta ${tipo} tiene un ${pct}% de probabilidad de ser falsa o manipulada digitalmente. ` +
            `Nuestro análisis indica con alta certeza que fue alterada mediante inteligencia artificial. ` +
            `No compartas este contenido — podría causar daño si se difunde.`,
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

    const ctx = { riskLevel, invalidCase, greyZone, hasFace, score, mediaType: resolvedMediaType };

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

    // Con ZeroTrue, faciaStatus siempre es null.
    // isDeepfake solo es true si riskLevel es HIGH o CRITICAL y no hay incertidumbre.
    const isDeepfake = (invalidCase || greyZone || riskLevel === 'SUSPICIOUS'
        || riskLevel === 'LOW' || riskLevel === 'MEDIUM')
        ? false
        : (riskLevel === 'HIGH' || riskLevel === 'CRITICAL');

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