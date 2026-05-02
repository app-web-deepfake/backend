import express from "express";
import cors from "cors";
import uploadRoutes from "./routes/upload.routes.js";
import faciaRoutes from "./routes/facia.routes.js";
import authRoutes from "./routes/auth.routes.js";
import historialRoutes from "./routes/historial.routes.js";
import analysisRoutes from "./routes/analysis.routes.js";

const app = express();

// CORS
app.use(cors({
    origin: process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Swagger — solo desarrollo local, import dinámico para evitar errores en Vercel
if (process.env.NODE_ENV !== "production") {
    try {
        const swaggerUi = (await import("swagger-ui-express")).default;
        const swaggerSpec = (await import("./config/swagger.js")).default;
        app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        console.log("Swagger disponible en /docs");
    } catch (e) {
        console.warn("Swagger no disponible:", e.message);
    }
}

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "Deepfake Detection API",
        version: "2.0.0",
        docs: process.env.NODE_ENV !== "production" ? "/docs" : "N/A"
    });
});

// Rutas
app.use("/upload", uploadRoutes);
app.use("/facia", faciaRoutes);
app.use("/auth", authRoutes);
app.use("/historial", historialRoutes);
app.use("/analysis", analysisRoutes);

// 404
app.use((req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
});

export default app;