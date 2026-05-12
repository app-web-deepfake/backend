import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import uploadRoutes from "./routes/upload.routes.js";
import faciaRoutes from "./routes/facia.routes.js";
import authRoutes from "./routes/auth.routes.js";
import historialRoutes from "./routes/historial.routes.js";
import analysisRoutes from "./routes/analysis.routes.js";
import swaggerSpec from "./config/swagger.js";

const app = express();

// Security headers (excluir /api-docs para no bloquear Swagger UI CDN)
app.use((req, res, next) => {
    if (req.path.startsWith("/api-docs")) return next();
    helmet()(req, res, next);
});

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

// Rate limiting para rutas de autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Demasiados intentos. Intenta de nuevo en 15 minutos." }
});

// Documentacion — Swagger UI via CDN (funciona en local y en Vercel)
app.get("/api-docs/spec", (req, res) => {
    res.json(swaggerSpec);
});

app.get("/api-docs", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Deepfake Detection API - Documentacion</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api-docs/spec',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        deepLinking: true,
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>`);
});

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "Deepfake Detection API",
        version: "2.0.0",
        docs: "/api-docs"
    });
});

// Rutas
app.use("/upload", uploadRoutes);
app.use("/facia", faciaRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/historial", historialRoutes);
app.use("/analysis", analysisRoutes);

// 404
app.use((req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, error: "Error interno del servidor" });
});

export default app;