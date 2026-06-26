import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import uploadRoutes from "./routes/upload.routes.js";
import faciaRoutes from "./routes/facia.routes.js";
import authRoutes from "./routes/auth.routes.js";
import historialRoutes from "./routes/historial.routes.js";
import analysisRoutes from "./routes/analysis.routes.js";
import streakRoutes from "./routes/streak.routes.js";
import swaggerSpec from "./config/swagger.js";

const app = express();

// Security headers (excluir /api-docs para no bloquear Swagger UI CDN)
app.use((req, res, next) => {
    if (req.path.startsWith("/api-docs")) return next();
    helmet()(req, res, next);
});

// CORS — acepta localhost en dev y FRONTEND_URL en prod
const allowedOrigins = [
    "http://localhost:5173",
    process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // Postman / server-to-server
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS bloqueado: ${origin}`);
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // preflight para TODAS las rutas

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Demasiados intentos. Intenta de nuevo en 15 minutos.",
    },
});

// Swagger
app.get("/api-docs/spec", (req, res) => {
    try {
        res.json(swaggerSpec);
    } catch (e) {
        res.status(500).json({ error: "No se pudo cargar la spec" });
    }
});

app.get("/api-docs", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Deepfake Detection API - Documentacion</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>body { margin: 0; } .topbar { display: none; }</style>
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
        docs: "/api-docs",
    });
});

// Rutas
app.use("/upload", uploadRoutes);
app.use("/deepfake", faciaRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/historial", historialRoutes);
app.use("/analysis", analysisRoutes);
app.use("/streak", streakRoutes);

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