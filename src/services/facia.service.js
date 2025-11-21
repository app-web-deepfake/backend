// src/services/facia.service.js (VERSION CON FORM-DATA)
import axios from 'axios';
import FormData from 'form-data';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const FACIA_API_URL = 'https://api.facia.ai';

// Cliente S3 para descargar archivos
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS,
        secretAccessKey: process.env.AWS_SECRET
    }
});

// Cache del token
let cachedToken = null;
let tokenExpiry = null;

async function getFaciaToken() {
    try {
        if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
            console.log("🔑 Usando token cacheado");
            return cachedToken;
        }

        console.log("🔑 Solicitando nuevo token de acceso a Facia...");

        const response = await axios.post(
            `${FACIA_API_URL}/request-access-token`,
            {
                client_id: process.env.FACIA_CLIENT_ID,
                client_secret: process.env.FACIA_CLIENT_SECRET
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const token = response.data?.result?.data?.token;

        if (!token) {
            console.error("❌ Respuesta inesperada de Facia:", response.data);
            throw new Error("No se recibió token de Facia");
        }

        cachedToken = token;
        tokenExpiry = Date.now() + (50 * 60 * 1000);

        console.log("✅ Token de acceso obtenido exitosamente");
        return cachedToken;

    } catch (error) {
        console.error("❌ Error obteniendo token de Facia:", error.response?.data || error.message);
        throw new Error("No se pudo autenticar con Facia API");
    }
}

function detectFileType(fileUrl) {
    const url = fileUrl.toLowerCase();

    if (url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.avi') ||
        url.endsWith('.webm') || url.endsWith('.mkv')) {
        return 'video';
    }

    return 'image';
}

function detectImageMimeType(fileUrl) {
    const url = fileUrl.toLowerCase();

    if (url.endsWith('.png')) {
        return 'png';
    } else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
        return 'jpeg';
    } else if (url.endsWith('.gif')) {
        return 'gif';
    } else if (url.endsWith('.webp')) {
        return 'webp';
    }

    return 'jpeg';
}

async function downloadFileFromS3(fileUrl) {
    try {
        console.log("📥 Descargando archivo de S3:", fileUrl);

        const url = new URL(fileUrl);
        const bucket = process.env.S3_BUCKET;
        const key = url.pathname.substring(1);

        console.log("📦 Bucket:", bucket);
        console.log("🔑 Key:", key);

        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });

        const response = await s3.send(command);

        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        if (buffer.length === 0) {
            throw new Error("El archivo descargado está vacío");
        }

        console.log("✅ Archivo descargado");
        console.log("📊 Tamaño buffer:", (buffer.length / 1024).toFixed(2), "KB");

        return {
            buffer: buffer,
            contentType: response.ContentType || 'application/octet-stream'
        };

    } catch (error) {
        console.error("❌ Error descargando archivo de S3:", error);
        throw new Error(`No se pudo descargar el archivo de S3: ${error.message}`);
    }
}

/**
 * VERSIÓN 1: Usando JSON con base64 (la actual)
 */
export const sendToFaciaJSON = async (fileUrl) => {
    try {
        console.log("🔍 [JSON] Procesando archivo para Facia:", fileUrl);

        const token = await getFaciaToken();
        const { buffer } = await downloadFileFromS3(fileUrl);
        const base64 = buffer.toString('base64');
        const fileType = detectFileType(fileUrl);

        console.log("📋 Tipo detectado:", fileType);

        let payload;

        if (fileType === 'video') {
            console.log("🎥 Procesando como VIDEO");
            const fileData = `data:video/mp4;base64,${base64}`;

            payload = {
                type: "liveness",
                file: fileData,
                file_type: "video",
                detect_deepfake: 1,
                offsite_liveness: 1,
                client_reference: `upload_${Date.now()}`
            };
        } else {
            console.log("🖼️ Procesando como IMAGEN");
            const imageType = detectImageMimeType(fileUrl);
            const fileData = `data:image/${imageType};base64,${base64}`;

            payload = {
                type: "liveness",
                file: fileData,
                file_type: "image",
                detect_deepfake: 1,
                offsite_liveness: 1,
                client_reference: `upload_${Date.now()}`
            };
        }

        console.log("📤 [JSON] Enviando a Facia API...");

        const response = await axios.post(
            `${FACIA_API_URL}/liveness`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log("✅ Respuesta de Facia:", response.data);

        if (!response.data?.result?.data?.reference_id) {
            throw new Error("No se recibió reference_id de Facia");
        }

        return response.data.result.data.reference_id;

    } catch (error) {
        console.error("❌ [JSON] Error enviando a Facia:", error.response?.data);
        throw error;
    }
};

/**
 * VERSIÓN 2: Usando FormData (alternativa)
 */
export const sendToFaciaFormData = async (fileUrl) => {
    try {
        console.log("🔍 [FORM-DATA] Procesando archivo para Facia:", fileUrl);

        const token = await getFaciaToken();
        const { buffer } = await downloadFileFromS3(fileUrl);
        const fileType = detectFileType(fileUrl);

        console.log("📋 Tipo detectado:", fileType);

        // Crear FormData
        const formData = new FormData();
        formData.append('type', 'liveness');
        formData.append('detect_deepfake', '1');
        formData.append('offsite_liveness', '1');
        formData.append('client_reference', `upload_${Date.now()}`);

        if (fileType === 'video') {
            console.log("🎥 Procesando como VIDEO con form-data");
            formData.append('file_type', 'video');
            formData.append('file', buffer, {
                filename: 'video.mp4',
                contentType: 'video/mp4'
            });
        } else {
            console.log("🖼️ Procesando como IMAGEN con form-data");
            formData.append('file_type', 'image');
            const imageType = detectImageMimeType(fileUrl);
            formData.append('file', buffer, {
                filename: `image.${imageType}`,
                contentType: `image/${imageType}`
            });
        }

        console.log("📤 [FORM-DATA] Enviando a Facia API...");
        console.log("⚠️ NOTA: Facia está diseñado para liveness detection (selfies en vivo)");
        console.log("   Si envías videos/fotos pregrabadas, puede marcarlas como fake");
        console.log("   porque detecta que NO es una captura en vivo de cámara");

        const response = await axios.post(
            `${FACIA_API_URL}/liveness`,
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log("✅ Respuesta de Facia:", response.data);

        if (!response.data?.result?.data?.reference_id) {
            throw new Error("No se recibió reference_id de Facia");
        }

        return response.data.result.data.reference_id;

    } catch (error) {
        console.error("❌ [FORM-DATA] Error enviando a Facia:", error.response?.data);
        throw error;
    }
};

/**
 * Función principal - Usa form-data directamente (más confiable)
 */
export const sendToFacia = async (fileUrl) => {
    console.log("🚀 Enviando a Facia usando form-data...");
    return await sendToFaciaFormData(fileUrl);
};

/**
 * Obtener el resultado de una transacción de Facia
 * Reintenta hasta obtener el resultado completo
 */
export const getFaciaResult = async (referenceId, maxRetries = 10, retryDelay = 3000) => {
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            attempts++;
            console.log(`📊 Consultando resultado de Facia (intento ${attempts}/${maxRetries}):`, referenceId);

            const token = await getFaciaToken();

            const response = await axios.post(
                `${FACIA_API_URL}/result`,
                {
                    reference_id: referenceId
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("✅ Respuesta de Facia:", response.data);

            if (!response.data?.result?.data) {
                throw new Error("Respuesta inválida de Facia");
            }

            const result = response.data.result.data;

            // Verificar si el resultado está completo (no null)
            if (result.status !== null && result.deepfake_score !== null) {
                console.log("✅ Resultado completo obtenido!");
                return result;
            }

            // Si aún está procesando, esperar y reintentar
            if (attempts < maxRetries) {
                console.log(`⏳ Resultado aún procesándose, esperando ${retryDelay/1000}s antes de reintentar...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                console.log("⚠️ Se alcanzó el máximo de reintentos, devolviendo resultado parcial");
                return result;
            }

        } catch (error) {
            console.error("❌ Error obteniendo resultado de Facia:", error.response?.data);

            if (error.response?.status === 401) {
                cachedToken = null;
                tokenExpiry = null;
            }

            // Si es el último intento, lanzar el error
            if (attempts >= maxRetries) {
                throw new Error(error.response?.data?.message || "FailedFaciaResult");
            }

            // Esperar antes de reintentar
            console.log(`⏳ Error, esperando ${retryDelay/1000}s antes de reintentar...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }

    throw new Error("No se pudo obtener el resultado después de múltiples intentos");
};