/**
 * deepfake.service.js
 * Integración con ZeroTrue API (reemplaza facia.service.js)
 *
 * Endpoints reales (verificados desde el SDK oficial):
 *   - POST /api/v1/analyze/file  → subir archivo como multipart/form-data
 *   - GET  /api/v1/result/{id}   → polling hasta status "completed"
 *
 * IMPORTANTE:
 *   - El api_key va TANTO en el header Authorization COMO en el body (form-data)
 *   - Los booleans van como strings: "true" / "false"
 *   - La respuesta puede tener los campos en rawResponse.result o directamente en rawResponse
 */

import axios from 'axios';
import FormData from 'form-data';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

// ─── Configuración ─────────────────────────────────────────────────────────────
const ZEROTRUE_BASE_URL = 'https://api.zerotrue.app';
const ZEROTRUE_API_KEY  = process.env.ZEROTRUE_API_KEY;

// Modelo de detección propio (microservicio ML in-house).
// Si USE_INHOUSE_MODEL=true se usa este servicio en lugar de ZeroTrue.
const USE_INHOUSE_MODEL = process.env.USE_INHOUSE_MODEL === 'true';
const ML_SERVICE_URL    = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const ML_API_KEY        = process.env.ML_API_KEY || '';   // se envía como header X-API-Key

const POLL_INTERVAL_MS  = 3000;
const POLL_MAX_ATTEMPTS = 20;   // ~60s total

if (!ZEROTRUE_API_KEY) {
    console.warn('[ZeroTrue] ⚠️  ZEROTRUE_API_KEY no configurada en .env');
}

// ─── Cliente S3 ───────────────────────────────────────────────────────────────
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId:     process.env.AWS_ACCESS,
        secretAccessKey: process.env.AWS_SECRET,
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectMediaType(fileUrl) {
    const url = fileUrl.toLowerCase().split('?')[0];
    if (/\.(mp4|mov|avi|webm|mkv)$/.test(url)) return 'video';
    return 'image';
}

function getFilenameFromUrl(fileUrl) {
    const url = fileUrl.split('?')[0];
    return decodeURIComponent(url.split('/').pop()) || 'file.jpg';
}

function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif',  webp: 'image/webp', bmp: 'image/bmp',
        tiff: 'image/tiff',
        mp4: 'video/mp4',  mov: 'video/quicktime',
        webm: 'video/webm', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    };
    return map[ext] || 'application/octet-stream';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Descarga desde S3 ────────────────────────────────────────────────────────
async function downloadFromS3(fileUrl) {
    try {
        console.log('[ZeroTrue] Descargando de S3:', fileUrl);
        const url    = new URL(fileUrl);
        const bucket = process.env.S3_BUCKET;
        const key    = decodeURIComponent(url.pathname.substring(1));
        console.log('[ZeroTrue] Bucket:', bucket, '| Key:', key);

        const command  = new GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await s3.send(command);

        const chunks = [];
        for await (const chunk of response.Body) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (buffer.length === 0) throw new Error('Archivo vacío descargado de S3');
        console.log('[ZeroTrue] Descargado —', (buffer.length / 1024).toFixed(2), 'KB');
        return buffer;
    } catch (error) {
        console.error('[ZeroTrue] Error S3:', error.message);
        throw new Error(`No se pudo descargar el archivo de S3: ${error.message}`);
    }
}

// ─── Inferencia con el modelo propio (microservicio ML) ───────────────────────
/**
 * Envía el archivo al microservicio ML propio (POST /analyze, multipart) y
 * normaliza la respuesta al mismo contrato que ZeroTrue:
 *   { score, mediaType, hasFace, details, analysisId }
 * Es síncrono (sin polling): el servicio devuelve el score directamente.
 *
 * @param {string} fileUrl  URL del archivo en S3
 */
async function sendToInhouseML(fileUrl) {
    const mediaType = detectMediaType(fileUrl);
    const filename  = getFilenameFromUrl(fileUrl);
    const mimeType  = getMimeType(filename);

    console.log(`[ML] Analizando con modelo propio — tipo: ${mediaType} — archivo: ${filename}`);
    const buffer = await downloadFromS3(fileUrl);

    const form = new FormData();
    form.append('file', buffer, { filename, contentType: mimeType });

    try {
        const resp = await axios.post(`${ML_SERVICE_URL}/analyze`, form, {
            headers:          { ...form.getHeaders(), ...(ML_API_KEY ? { 'X-API-Key': ML_API_KEY } : {}) },
            timeout:          120_000,
            maxContentLength: Infinity,
            maxBodyLength:    Infinity,
        });
        const d = resp.data || {};
        console.log('[ML] Score:', d.score, '| detalles:', JSON.stringify(d.details || {}));
        return {
            score:      typeof d.score === 'number' ? d.score : 0,
            mediaType:  d.mediaType || mediaType,
            hasFace:    typeof d.hasFace === 'boolean' ? d.hasFace : (mediaType === 'image'),
            details:    { provider: 'inhouse-ml', ...(d.details || {}) },
            analysisId: d.analysisId || `ml_${Date.now()}`,
        };
    } catch (error) {
        const detail = error.response?.data;
        console.error('[ML] Error en servicio ML:', error.message, JSON.stringify(detail || ''));
        throw new Error(`Servicio ML no disponible: ${detail?.detail || error.message}`);
    }
}

// ─── Normalización de respuesta ───────────────────────────────────────────────
/**
 * El SDK aplana la respuesta: si viene { result: {...}, id, status }
 * los campos de result se copian al nivel raíz.
 * Manejamos ambos casos.
 *
 * Campos clave:
 *   ai_probability     → 0-100 (lo normalizamos a 0-1)
 *   human_probability  → 0-100
 *   result_type        → "ai" | "human"
 *   suspected_models   → array de modelos detectados
 */
function normalizeZeroTrueResponse(raw, mediaType) {
    // ZeroTrue devuelve los campos en raw.result — los aplanamos
    const data = (raw.result && typeof raw.result === 'object')
        ? { ...raw, ...raw.result }
        : raw;

    // ── Score base ──────────────────────────────────────────────────────────────
    // ai_probability viene en 0-100 o 0-1 (verificamos ambos)
    let aiPct = typeof data.ai_probability === 'number' ? data.ai_probability
        : typeof data.combined_probability === 'number' ? data.combined_probability
            : 50;

    // Si el valor es claramente 0-1 (ej: 0.024), convertimos a porcentaje
    if (aiPct <= 1.0 && aiPct >= 0) aiPct = aiPct * 100;

    let score = Math.min(1, Math.max(0, aiPct / 100));

    // Si ZeroTrue dice "human_created" pero el score quedó alto, invertir
    const resultType = (data.result_type || '').toLowerCase();
    if ((resultType === 'human' || resultType === 'human_created') && score > 0.5) {
        score = 1 - score;
    }

    // ── Señales internas de ZeroTrue ─────────────────────────────────────────────
    const extra              = data.details_extra || data.details?.extra || {};
    const features           = extra.features || {};
    const ganArtifacts       = typeof features.gan_artifacts       === 'number' ? features.gan_artifacts       : null;
    const textureConsistency = typeof features.texture_consistency === 'number' ? features.texture_consistency : null;
    const faceSymmetry       = typeof features.face_symmetry       === 'number' ? features.face_symmetry       : null;
    const suspectedModels    = data.suspected_models || [];
    const summaryConfidence  = data.details?.summary?.confidence_pct
        ?? data.details_summary?.confidence_pct ?? 0;

    // Top modelo atribuido (solo indica a qué IA se parece, no si ES IA)
    const topModel = suspectedModels.length > 0
        ? suspectedModels.reduce((a, b) =>
            (a.confidence_pct || 0) > (b.confidence_pct || 0) ? a : b)
        : null;
    const topModelName = (topModel?.model_name || topModel?.name || '').toLowerCase();
    const topModelPct  = topModel?.confidence_pct || 0;
    if (topModelName) {
        console.log(`[ZeroTrue] Top attributed model (solo atribución): ${topModelName} ${topModelPct}%`);
    }

    // ── Corrección 1: gan_artifacts alto + ZeroTrue poco seguro ──────────────
    // Solo activa si ZeroTrue mismo tiene baja confianza en su veredicto
    if (ganArtifacts !== null && ganArtifacts > 0.80 && score < 0.35 && summaryConfidence < 70) {
        const corrected = (score + ganArtifacts * 0.5) / 2;
        console.log(`[ZeroTrue] Fix gan_artifacts=${ganArtifacts} (conf=${summaryConfidence}%): ${score.toFixed(3)} → ${corrected.toFixed(3)}`);
        score = Math.min(1, corrected);
    }

    // ── Corrección 2: patrón imagen IA hiperrealista (puntuación compuesta) ──
    // ZeroTrue es no-determinista — los features varían entre llamadas.
    // En vez de umbrales fijos, usamos una puntuación compuesta:
    //   - cada feature contribuye si supera su umbral MÍNIMO
    //   - necesitamos al menos 2 de 3 señales + score bajo
    if (score < 0.30 && mediaType === 'image') {
        let aiSignals = 0;
        if (ganArtifacts       !== null && ganArtifacts       >= 0.60) aiSignals++;
        if (textureConsistency !== null && textureConsistency >= 0.65) aiSignals++;
        if (faceSymmetry       !== null && faceSymmetry       >= 0.70) aiSignals++;

        if (aiSignals >= 2) {
            console.log(`[ZeroTrue] Patrón IA hiperrealista (${aiSignals}/3 señales: gan=${ganArtifacts}, tex=${textureConsistency}, sym=${faceSymmetry}): score ${score.toFixed(3)} → 0.46`);
            score = 0.46;   // mínimo para caer en zona SUSPICIOUS
        }
    }

    score = Math.min(1, Math.max(0, score));

    // ── Detección de rostro ─────────────────────────────────────────────────────
    // suspected_models con deepfake → hay rostro. Si no hay modelos, asumimos por tipo.
    const hasFace = suspectedModels.length > 0 ? true : mediaType === 'image';

    return {
        score,
        mediaType,
        hasFace,
        details: {
            zerotrue_id:        data.id               || raw.id || null,
            status:             data.status            || null,
            result_type:        data.result_type       || null,
            ai_probability:     data.ai_probability    ?? null,
            human_probability:  data.human_probability ?? null,
            suspected_models:   suspectedModels,
            gan_artifacts:      ganArtifacts,
            ml_model:           data.ml_model          || null,
            ml_model_version:   data.ml_model_version  || null,
            resolution:         data.resolution        || null,
            size_bytes:         data.size_bytes        || null,
            rawResponse:        raw,
        },
    };
}

// ─── Polling hasta resultado completo ─────────────────────────────────────────
async function pollForResult(checkId) {
    // GET /api/v1/result/{id}?api_key=...
    const url = `${ZEROTRUE_BASE_URL}/api/v1/result/${checkId}`;

    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
        console.log(`[ZeroTrue] Polling ${attempt}/${POLL_MAX_ATTEMPTS} — ID: ${checkId}`);

        const response = await axios.get(url, {
            params:  { api_key: ZEROTRUE_API_KEY },
            headers: { 'Accept': 'application/json' },
            timeout: 15_000,
        });

        const data = response.data;
        console.log('[ZeroTrue] Status polling:', data.status);

        if (data.status === 'completed') {
            console.log('[ZeroTrue] ✅ Análisis completado');
            return data;
        }

        if (['failed', 'canceled', 'expired'].includes(data.status)) {
            throw new Error(`ZeroTrue análisis finalizado con estado: ${data.status}`);
        }

        if (attempt < POLL_MAX_ATTEMPTS) await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`ZeroTrue: timeout esperando resultado (${POLL_MAX_ATTEMPTS} intentos × ${POLL_INTERVAL_MS/1000}s)`);
}

// ─── Función principal ────────────────────────────────────────────────────────
/**
 * Envía un archivo a ZeroTrue vía POST /api/v1/analyze/file (multipart)
 * y hace polling a GET /api/v1/result/{id} hasta obtener el resultado.
 *
 * @param {string} fileUrl  URL del archivo en S3
 * @returns {Promise<{ score, mediaType, hasFace, details, analysisId }>}
 */
export async function sendToDeepfake(fileUrl) {
    // Modelo propio (microservicio ML) — reemplaza a ZeroTrue cuando USE_INHOUSE_MODEL=true
    if (USE_INHOUSE_MODEL) {
        return sendToInhouseML(fileUrl);
    }

    if (!ZEROTRUE_API_KEY) {
        throw new Error('ZEROTRUE_API_KEY no configurada. Agrega la variable al .env');
    }

    const mediaType = detectMediaType(fileUrl);
    const filename  = getFilenameFromUrl(fileUrl);
    const mimeType  = getMimeType(filename);

    console.log(`[ZeroTrue] Iniciando análisis — tipo: ${mediaType} — archivo: ${filename}`);

    // 1. Descargar de S3
    const buffer = await downloadFromS3(fileUrl);

    // 2. Construir multipart/form-data
    //    El SDK pone api_key en el body + Authorization header
    const formData = new FormData();
    formData.append('file',            buffer, { filename, contentType: mimeType });
    formData.append('api_key',         ZEROTRUE_API_KEY);   // requerido en el body
    formData.append('is_private_scan', 'false');  // false = usa créditos gratuitos
    formData.append('is_deep_scan',    'false');

    console.log('[ZeroTrue] Enviando archivo a /api/v1/analyze/file...');

    let checkId;
    try {
        const response = await axios.post(
            `${ZEROTRUE_BASE_URL}/api/v1/analyze/file`,
            formData,
            {
                headers: {
                    'Accept': 'application/json',
                    ...formData.getHeaders(),
                },
                timeout:          120_000,
                maxContentLength: Infinity,
                maxBodyLength:    Infinity,
            }
        );

        const resData = response.data;
        console.log('[ZeroTrue] Respuesta creación:', JSON.stringify(resData));

        // El id puede estar en data.id o data.content_id (algunas APIs usan content_id)
        checkId = resData?.id || resData?.content_id || resData?.check_id;
        if (!checkId) throw new Error('ZeroTrue no retornó un ID. Respuesta: ' + JSON.stringify(resData));

        console.log('[ZeroTrue] Check ID:', checkId, '| Status:', resData?.status);

        // Si ya viene completado de una vez (poco probable pero posible)
        if (resData?.status === 'completed') {
            const normalized = normalizeZeroTrueResponse(resData, mediaType);
            return { ...normalized, analysisId: checkId };
        }

    } catch (error) {
        const status = error.response?.status;
        const detail = error.response?.data;

        console.error('[ZeroTrue] Error en /analyze/file:', status, JSON.stringify(detail) || error.message);

        if (status === 401 || status === 403) throw new Error('ZeroTrue API Key inválida o sin permisos. Verifica ZEROTRUE_API_KEY en .env');
        if (status === 429)                   throw new Error('ZeroTrue: límite de requests alcanzado. Intenta en unos minutos.');
        if (status === 422) {
            const msg = detail?.error?.message || detail?.message || JSON.stringify(detail);
            throw new Error(`ZeroTrue: archivo no compatible. Detalle: ${msg}`);
        }

        throw new Error(
            detail?.error?.message || detail?.message || error.message || 'Error desconocido en ZeroTrue'
        );
    }

    // 3. Polling hasta resultado completo
    const rawResult  = await pollForResult(checkId);
    console.log("[ZeroTrue] Raw result completo:", JSON.stringify(rawResult, null, 2));
    const normalized = normalizeZeroTrueResponse(rawResult, mediaType);
    console.log("[ZeroTrue] Score:", normalized.score, "| hasFace:", normalized.hasFace, "| result_type:", rawResult?.result?.result_type || rawResult?.result_type || "N/A");

    return { ...normalized, analysisId: checkId };
}

/**
 * Re-consulta un resultado por ID (usado si el frontend perdió la respuesta).
 */
export async function getDeepfakeResult(analysisId, cachedResult = null) {
    if (cachedResult) return cachedResult;
    console.log('[ZeroTrue] Re-consultando resultado para ID:', analysisId);
    const raw = await pollForResult(analysisId);
    return normalizeZeroTrueResponse(raw, 'image');
}