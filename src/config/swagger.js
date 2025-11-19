import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import yaml from "yaml";

// ✅ Obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Leer el archivo YAML de forma compatible con Vercel
let swaggerSpec;

try {
    // Intentar múltiples rutas posibles
    const possiblePaths = [
        join(__dirname, "../docs/openapi.yaml"),
        join(process.cwd(), "src/docs/openapi.yaml"),
        join(process.cwd(), "docs/openapi.yaml"),
    ];

    let yamlContent;
    for (const yamlPath of possiblePaths) {
        try {
            yamlContent = readFileSync(yamlPath, "utf8");
            console.log(`✅ OpenAPI YAML cargado desde: ${yamlPath}`);
            break;
        } catch (err) {
            continue;
        }
    }

    if (!yamlContent) {
        throw new Error("No se encontró el archivo openapi.yaml");
    }

    swaggerSpec = yaml.parse(yamlContent);

    // ✅ Actualizar la URL del servidor según el entorno
    if (process.env.NODE_ENV === 'production') {
        const productionUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.API_URL || 'https://tu-api.vercel.app';

        swaggerSpec.servers = [
            {
                url: productionUrl,
                description: 'Producción'
            }
        ];
    }

} catch (error) {
    console.error("❌ Error cargando openapi.yaml:", error);

    // ✅ Fallback: Especificación básica si falla
    swaggerSpec = {
        openapi: "3.1.0",
        info: {
            title: "Deepfake Detection API",
            version: "2.0.0",
            description: "API para detección de deepfakes"
        },
        servers: [
            {
                url: process.env.VERCEL_URL
                    ? `https://${process.env.VERCEL_URL}`
                    : "http://localhost:4000"
            }
        ],
        paths: {}
    };
}

export default swaggerSpec;