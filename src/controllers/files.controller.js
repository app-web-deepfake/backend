import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS,
        secretAccessKey: process.env.AWS_SECRET
    },
    runtime: "node",
});
console.log("Región detectada:", process.env.AWS_REGION);

/**
 * @openapi
 * components:
 *   schemas:
 *     FaciaCallback:
 *       type: object
 *       properties:
 *         session_id:
 *           type: string
 *         score:
 *           type: number
 *         is_deepfake:
 *           type: boolean
 */

// --- 1. Crear URL presignada para subir archivo ---
export const getPresignedUrl = async (req, res) => {
    try {
        console.log("Generando PRESIGNED POST");
        console.log("Body recibido:", req.body);

        const { fileName, fileType } = req.body;

        if (!fileName || !fileType) {
            console.error("Faltan parámetros:", { fileName, fileType });
            return res.status(400).json({ error: "fileName y fileType son requeridos" });
        }

        const key = `${Date.now()}_${fileName}`;
        console.log("Key generada:", key);

        // CONFIGURACIÓN DEL PRESIGNED POST
        const { url, fields } = await createPresignedPost(s3, {
            Bucket: process.env.S3_BUCKET,
            Key: key,
            Conditions: [
                ["content-length-range", 0, 5000000000], // Máx 5GB
                { bucket: process.env.S3_BUCKET },
                { key },
            ],
            Expires: 3600, // 1 hora
        });

        console.log("Presigned POST generado exitosamente");
        console.log("Upload URL:", url);
        console.log("Fields:", fields);

        // Construir la URL final del archivo
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        const fileUrl = `${cleanUrl}/${key}`;

        console.log("File URL:", fileUrl);

        return res.json({
            uploadUrl: url,
            fields,
            fileUrl
        });

    } catch (err) {
        console.error("Error generando presigned POST:", err);
        console.error("Stack:", err.stack);
        return res.status(500).json({
            error: "Failed to generate presigned POST",
            details: err.message
        });
    }
};

