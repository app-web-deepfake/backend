import "./src/config/env.js";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";

let isConnected = false;

/**
 * Inicializa la conexión a la base de datos una sola vez
 */
const initDB = async () => {
    if (!isConnected) {
        try {
            await connectDB();
            isConnected = true;
            console.log("✅ Base de datos conectada");
        } catch (error) {
            console.error("❌ Error conectando a la DB:", error);
            throw error;
        }
    }
};

/**
 * Handler para Vercel (Serverless Function)
 */
export default async function handler(req, res) {
    await initDB();

    // Delega el manejo de rutas a Express
    return app(req, res);
}