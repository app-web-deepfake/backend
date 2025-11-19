// ✅ Import estático del JSON (funciona perfecto en Vercel)
import swaggerSpecBase from "../docs/openapi.json" with { type: "json" };

// ✅ Clonar y actualizar según el entorno
const swaggerSpec = JSON.parse(JSON.stringify(swaggerSpecBase));

// Actualizar servidor según entorno
if (process.env.NODE_ENV === 'production') {
    const productionUrl = process.env.API_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
        'https://backend-iota-ten-94.vercel.app';  // ✅ Tu URL real

    swaggerSpec.servers = [
        {
            url: productionUrl,
            description: 'Producción'
        },
        ...(swaggerSpec.servers || [])
    ];
}

export default swaggerSpec;