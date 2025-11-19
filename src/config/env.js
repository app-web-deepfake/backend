import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });


console.log("ENV LOADED IN env.js:", {
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS: process.env.AWS_ACCESS,
    AWS_SECRET: process.env.AWS_SECRET ? "✅" : "❌",
}
);


export const {
    MONGO_URI,
    AWS_REGION,
    AWS_ACCESS,
    AWS_SECRET,
    S3_BUCKET,
} = process.env;