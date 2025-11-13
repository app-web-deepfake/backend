import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS.replace(/"/g, ""),
        secretAccessKey: process.env.AWS_SECRET.replace(/"/g, "")
    }
});

export const getPresignedUrl = async (req, res) => {
    try {
        const { filename, filetype } = req.body;

        if (!filename || !filetype) {
            return res.status(400).json({ error: "filename y filetype son requeridos" });
        }

        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: filename,
            ContentType: filetype
        });

        const presignedUrl = await getSignedUrl(s3, command, {
            expiresIn: 60 * 5 // 5 minutos
        });

        const fileUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;

        return res.json({ presignedUrl, fileUrl });

    } catch (error) {
        console.error("❌ Error generando presigned URL:", error);
        return res.status(500).json({ error: "Error generando presigned URL" });
    }
};
