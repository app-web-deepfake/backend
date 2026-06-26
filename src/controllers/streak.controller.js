import User from "../models/User.js";

/**
 * "Día de Lima" — compara fechas en hora Peru (UTC-5).
 * Usamos offset fijo; no necesitamos DST porque Peru no lo usa.
 */
const LIMA_OFFSET_HOURS = -5;

function toLocalDay(utcDate) {
    // Devuelve un string "YYYY-MM-DD" en hora Lima
    const d = new Date(utcDate.getTime() + LIMA_OFFSET_HOURS * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10); // "2026-06-25"
}

function isSameLocalDay(d1, d2) {
    return toLocalDay(d1) === toLocalDay(d2);
}

function isConsecutiveLocalDay(earlier, later) {
    // ¿'earlier' es exactamente el día anterior a 'later' en hora Lima?
    const a = toLocalDay(earlier); // "2026-06-24"
    const b = toLocalDay(later);   // "2026-06-25"
    const dayBefore = new Date(later.getTime() + LIMA_OFFSET_HOURS * 60 * 60 * 1000);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    return a === dayBefore.toISOString().slice(0, 10);
}

/**
 * GET /streak — racha del usuario autenticado
 */
export const getStreak = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select(
            "streak maxStreak lastAnalysisDate totalAnalyses name"
        );
        if (!user) return res.status(404).json({ success: false, error: "Usuario no encontrado" });

        const now = new Date();
        const last = user.lastAnalysisDate;

        // ¿Analizó hoy?
        const analyzedToday = last ? isSameLocalDay(last, now) : false;

        // ¿La racha sigue viva? (analizó hoy o ayer)
        let currentStreak = user.streak || 0;
        if (last && !analyzedToday && !isConsecutiveLocalDay(last, now)) {
            // No analizó ayer ni hoy → racha perdida
            currentStreak = 0;
        }

        res.json({
            success: true,
            streak: {
                current: currentStreak,
                max: user.maxStreak || 0,
                lastAnalysisDate: last,
                totalAnalyses: user.totalAnalyses || 0,
                analyzedToday,
            },
        });
    } catch (err) {
        console.error("getStreak error:", err);
        res.status(500).json({ success: false, error: "Error obteniendo racha" });
    }
};

/**
 * GET /streak/leaderboard — top 10 usuarios con más racha activa
 * Solo expone nombre (sin email ni datos sensibles)
 */
export const getLeaderboard = async (req, res) => {
    try {
        const now = new Date();
        // Usuarios que analizaron en las últimas 48h (racha viva)
        const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const top = await User.find({
            streak: { $gt: 0 },
            lastAnalysisDate: { $gte: cutoff },
        })
            .select("name streak maxStreak totalAnalyses")
            .sort({ streak: -1, maxStreak: -1 })
            .limit(10);

        res.json({
            success: true,
            leaderboard: top.map((u, i) => ({
                rank: i + 1,
                name: u.name,
                streak: u.streak,
                maxStreak: u.maxStreak || 0,
                totalAnalyses: u.totalAnalyses || 0,
            })),
        });
    } catch (err) {
        console.error("getLeaderboard error:", err);
        res.status(500).json({ success: false, error: "Error obteniendo ranking" });
    }
};

/**
 * Función interna — llamada SOLO desde analysis.controller al completar un análisis.
 * Esta es la única forma en que la racha puede crecer.
 */
export const recordAnalysisStreak = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        const now = new Date();
        const last = user.lastAnalysisDate;

        // Ya analizó hoy → solo sumar al contador, la racha no cambia
        if (last && isSameLocalDay(last, now)) {
            await User.findByIdAndUpdate(userId, { $inc: { totalAnalyses: 1 } });
            return;
        }

        // Calcular nueva racha
        let newStreak;
        if (!last) {
            newStreak = 1; // primer análisis de su vida
        } else if (isConsecutiveLocalDay(last, now)) {
            newStreak = (user.streak || 0) + 1; // día consecutivo ✓
        } else {
            newStreak = 1; // racha rota — reinicia desde 1
        }

        const newMax = Math.max(newStreak, user.maxStreak || 0);

        await User.findByIdAndUpdate(userId, {
            streak: newStreak,
            maxStreak: newMax,
            lastAnalysisDate: now,   // ← SOLO campo que se actualiza aquí
            $inc: { totalAnalyses: 1 },
        });

        console.log(`[streak] userId=${userId} streak=${newStreak} max=${newMax}`);
    } catch (err) {
        console.error("recordAnalysisStreak error:", err);
    }
};

// Alias para el import en analysis.controller.js
export const incrementAnalysisCount = recordAnalysisStreak;
