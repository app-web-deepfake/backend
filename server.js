import "./src/config/env.js";
import app from './src/app.js';
import { connectDB } from './src/config/db.js';
import {fileURLToPath} from "url";
import path from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`✅ Backend corriendo en puerto ${PORT}`);
        console.log("AWS REGION:", process.env.AWS_REGION);
        console.log("AWS ACCESS:", process.env.AWS_ACCESS);
        console.log("AWS SECRET:", process.env.AWS_SECRET ? "Cargada" : "No cargada");
    });
});