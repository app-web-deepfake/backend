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

// ── Local: levantar servidor normal ──────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 4000;
    initDB().then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
            console.log(`📄 Docs en http://localhost:${PORT}/api-docs`);
        });
    }).catch(() => process.exit(1));
}

// ── Vercel: exportar handler serverless ──────────────────────────────────────
export default async function handler(req, res) {
    await initDB();
    return app(req, res);
}