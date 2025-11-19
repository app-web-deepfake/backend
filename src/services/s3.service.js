import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AWS_REGION, AWS_ACCESS, AWS_SECRET, S3_BUCKET } from '../config/env.js';

const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS,
        secretAccessKey: AWS_SECRET
    }
});

export const getPresignedUrl = async (key, fileType) => {
    const contentType = fileType === 'video' ? 'video/mp4' : 'image/jpeg';
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
    return { url, key };
};
