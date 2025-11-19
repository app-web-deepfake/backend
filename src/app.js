import express from "express";
import uploadRoutes from "./routes/upload.routes.js";
import faciaRoutes from "./routes/facia.routes.js";
import authRoutes from "./routes/auth.routes.js";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";
import cors from "cors";
import analysisRoutes from "./routes/analysis.routes.js";

const app = express();

// ✅ CORS configurado para desarrollo Y producción
app.use(cors({
    origin: process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL  // Vercel frontend
        : "http://localhost:5173",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Swagger
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ✅ Ruta de health check (para verificar que el servidor funciona)
app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "Deepfake Detection API",
        version: "2.0.0",
        docs: "/docs"
    });
});

// Rutas principales
app.use("/facia", faciaRoutes);
app.use("/auth", authRoutes);
app.use("/upload", uploadRoutes);
app.use("/analysis", analysisRoutes);

// ✅ Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: "Ruta no encontrada",
        path: req.path
    });
});


export default app;