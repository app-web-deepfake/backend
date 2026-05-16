import crypto from "crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId:     process.env.AWS_ACCESS,
        secretAccessKey: process.env.AWS_SECRET,
    },
});

/**
 * Descarga el archivo de S3 y calcula su hash SHA-256.
 * El hash identifica el contenido exacto del archivo,
 * independiente del nombre o URL.
 */
export async function computeFileHash(fileUrl) {
    try {
        const url    = new URL(fileUrl);
        const bucket = process.env.S3_BUCKET;
        const key    = decodeURIComponent(url.pathname.substring(1));

        const command  = new GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await s3.send(command);

        const hash = crypto.createHash("sha256");
        for await (const chunk of response.Body) {
            hash.update(chunk);
        }
        return hash.digest("hex");
    } catch (err) {
        console.error("Error calculando hash del archivo:", err.message);
        return null; // Si falla, no bloqueamos el flujo — simplemente no usamos caché
    }
}