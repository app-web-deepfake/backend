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
