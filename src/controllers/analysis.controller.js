import { sendToFacia, getFaciaResult } from '../services/facia.service.js';

// --- 2. Notificar que el archivo está listo y enviar a Facia ---
export const startAnalysis = async (req, res) => {
    try {
        const { fileUrl } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ error: "fileUrl requerido" });
        }

        console.log("Notificación de archivo subido:", fileUrl);

        // Crear transacción en Facia y obtener reference_id
        const referenceId = await sendToFacia(fileUrl);

        console.log("Transacción creada en Facia, reference_id:", referenceId);

        // Devolver el reference_id para que el frontend pueda consultar el resultado
        return res.status(200).json({
            success: true,
            analysisId: referenceId,
            message: "Archivo enviado a análisis correctamente. El procesamiento puede tomar unos segundos.",
            estimatedTime: "5-30 segundos",
            status: "processing"  // NUEVO
        });

    } catch (error) {
        console.error("Error notifyUploadDone:", error);
        console.error("Stack:", error.stack);

        // Manejar errores específicos
        let errorMessage = "Error interno del servidor";
        let statusCode = 500;

        if (error.message.includes("FailedFacia")) {
            errorMessage = "No se pudo enviar el archivo a análisis. Por favor, intenta de nuevo.";
            statusCode = 503;
        } else if (error.message.includes("S3")) {
            errorMessage = "No se pudo acceder al archivo. Verifica que se haya subido correctamente.";
            statusCode = 404;
        }

        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// --- 3. Obtener resultado de Facia ---
export const getAnalysisResult = async (req, res) => {
    try {
        const { referenceId } = req.body;

        if (!referenceId) {
            return res.status(400).json({
                success: false,
                error: "referenceId requerido"
            });
        }

        console.log("Consultando resultado para:", referenceId);

        // Obtener resultado de Facia (con reintentos automáticos)
        const result = await getFaciaResult(referenceId);

        console.log("Resultado obtenido:", result);

        // Verificar si el resultado está completo
        const isComplete = result.status !== null && result.deepfake_score !== null;

        if (!isComplete) {
            return res.status(202).json({
                success: true,
                processing: true,
                message: "El análisis aún está en proceso. Por favor, vuelve a consultar en unos segundos.",
                result: {
                    analysisId: result.reference_id,
                    status: "processing"
                }
            });
        }

        // ----------------------------
        // LÓGICA DE VEREDICTO PERSONALIZADA
        // ----------------------------
        // Regla A: Si deepfake_score < 0.6 => considerarlo NO deepfake (REAL)
        const score = result.deepfake_score;
        const scoreIndicatesReal = typeof score === 'number' && score < 0.6;

        // Regla B: Si decline_code === "FADR07" => NO deepfake (Evasion attack detected -> tratar como real)
        const evasionAttackDetected = result.decline_code === "FADR07";

        // Regla C: Si Facia reporta status === 1 => real
        const faciaSaysReal = result.status === 1;

        // Determinar si es deepfake SOLO si NO se cumple ninguna excepción
        const finalIsDeepfake =
            // si Facia dice 0 (fake) *y* no se cumple scoreIndicatesReal *y* no es FADR07
            (result.status === 0) &&
            !scoreIndicatesReal &&
            !evasionAttackDetected;

        const finalVerdict = finalIsDeepfake ? "FAKE" : "REAL";

        // Responder al frontend con la info original + veredicto aplicado
        return res.status(200).json({
            success: true,
            processing: false,
            result: {
                analysisId: result.reference_id,
                verdict: finalVerdict,
                timestamp: new Date().toISOString(),
                type: result.type,
                status: result.status, // valor original de Facia
                isDeepfake: finalIsDeepfake,
                isAuthentic: !finalIsDeepfake,
                confidence: (typeof score === 'number') ? (score * 100).toFixed(2) : null,
                deepfake_score: score,
                decline_code: result.decline_code,
                decline_reason: result.decline_reason,
                declined_proof: result.declined_proof,
                client_reference: result.client_reference,
                // Para depuración: qué reglas aplicaron
                rule_applied: {
                    scoreIndicatesReal,
                    evasionAttackDetected,
                    facia_original_status: result.status
                }
            }
        });

    } catch (error) {
        console.error("Error getAnalysisResult:", error);

        // Manejar errores específicos
        let errorMessage = "Error obteniendo resultado del análisis";
        let statusCode = 500;

        if (error.message.includes("FailedFaciaResult")) {
            errorMessage = "No se pudo obtener el resultado. El ID de referencia puede ser inválido.";
            statusCode = 404;
        } else if (error.message.includes("múltiples intentos")) {
            errorMessage = "El análisis está tomando más tiempo del esperado. Por favor, intenta de nuevo en unos momentos.";
            statusCode = 408; // Request Timeout
        }

        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// --- 4. BONUS: Endpoint para verificar estado del análisis ---
export const checkAnalysisStatus = async (req, res) => {
    try {
        const { referenceId } = req.params;

        if (!referenceId) {
            return res.status(400).json({
                success: false,
                error: "referenceId requerido"
            });
        }

        console.log("🔍 Verificando estado para:", referenceId);

        // Hacer solo 1 intento sin reintentos
        const result = await getFaciaResult(referenceId, 1, 0);

        const isComplete = result.status !== null && result.deepfake_score !== null;

        let computed = null;
        if (isComplete) {
            const score = result.deepfake_score;
            const scoreIndicatesReal = typeof score === 'number' && score < 0.6;
            const evasionAttackDetected = result.decline_code === "FADR07";

            const finalIsDeepfake = (result.status === 0) && !scoreIndicatesReal && !evasionAttackDetected;
            computed = {
                isDeepfake: finalIsDeepfake,
                confidence: (typeof score === 'number') ? (score * 100).toFixed(2) : null,
                verdict: finalIsDeepfake ? "FAKE" : "REAL",
                rule_applied: { scoreIndicatesReal, evasionAttackDetected }
            };
        }

        return res.status(200).json({
            success: true,
            analysisId: referenceId,
            status: isComplete ? "completed" : "processing",
            isComplete: isComplete,
            result: computed
        });

    } catch (error) {
        console.error("❌ Error checkAnalysisStatus:", error);
        return res.status(500).json({
            success: false,
            error: "Error verificando estado del análisis"
        });
    }
};