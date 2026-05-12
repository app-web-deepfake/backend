import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

export const {
    MONGO_URI,
    AWS_REGION,
    AWS_ACCESS,
    AWS_SECRET,
    S3_BUCKET,
    EMAIL_USER,
    EMAIL_PASS,
} = process.env;