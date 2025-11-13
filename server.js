// Cargar .env primero
import "./src/config/env.js";

import express from "express";
import { connectDB } from "./src/config/db.js";
import app from "./src/app.js";

const PORT = process.env.PORT || 4000;

// Conectar DB y luego iniciar el servidor
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Backend corriendo en puerto ${PORT}`);
    });
});
