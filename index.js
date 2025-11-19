import "dotenv/config";
import app from "./src/app.js";

const PORT = process.env.PORT || 4000;

// Para desarrollo local
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        console.log(`📚 Documentación en http://localhost:${PORT}/docs`);
    });
}

export default app;
