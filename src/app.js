import express from "express";
import cors from "cors";

import uploadRoutes from "./routes/upload.routes.js";
import analysisRoutes from "./routes/analysis.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

// Rutas
app.use("/upload", uploadRoutes);
app.use("/analysis", analysisRoutes);

export default app;
