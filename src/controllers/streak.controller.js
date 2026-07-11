import User from "../models/User.js";

const LIMA_OFFSET_HOURS = -5;

function toLocalDayStr(utcDate) {
    const d = new Date(utcDate.getTime() + LIMA_OFFSET_HOURS * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10); // "2026-06-25"
}

function isConsecutiveDay(earlier, laterDayStr) {
    const d = new Date(earlier.getTime() + LIMA_OFFSET_HOURS * 60 * 60 * 1000);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10) === laterDayStr;
}

/** GET /streak — racha del usuario autenticado */
export const getStreak = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select(
            "streak maxStreak lastAnalysisDate totalAnalyses todayAnalyses todayDate name"
        );
        if (!user) return res.status(404).json({ success: false, error: "Usuario no encontrado" });

        const nowStr = toLocalDayStr(new Date());
        const analyzedToday = user.todayDate === nowStr;
        const todayCount = analyzedToday ? (user.todayAnalyses || 0) : 0;

        // Racha viva = analizó hoy o ayer
        let currentStreak = user.streak || 0;
        if (user.lastAnalysisDate && !analyzedToday) {
            const lastStr = toLocalDayStr(user.lastAnalysisDate);
            if (!isConsecutiveDay(user.lastAnalysisDate, nowStr)) {
                currentStreak = 0; // racha perdida
            }
        }

        res.json({
            success: true,
            streak: {
                current:        currentStreak,
                max:            user.maxStreak || 0,
                lastAnalysisDate: user.lastAnalysisDate,
                totalAnalyses:  user.totalAnalyses || 0,
                todayAnalyses:  todayCount,
                analyzedToday,
            },
        });
    } catch (err) {
        console.error("getStreak error:", err);
        res.status(500).json({ success: false, error: "Error obteniendo racha" });
    }
};

/** GET /streak/leaderboard — top 10 con racha activa */
export const getLeaderboard = async (req, res) => {
    try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const top = await User.find({ streak: { $gt: 0 }, lastAnalysisDate: { $gte: cutoff } })
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
 * GET /streak/admin/stats — estadísticas para el panel admin
 * Solo accesible con role === "admin"
 */
export const getAdminStats = async (req, res) => {
    try {
        const now = new Date();
        const todayStr = toLocalDayStr(now);
        const last7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
        const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers,
            activeToday,
            activeLast7,
            activeLast30,
            topStreaks,
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ todayDate: todayStr }),
            User.countDocuments({ lastAnalysisDate: { $gte: last7 } }),
            User.countDocuments({ lastAnalysisDate: { $gte: last30 } }),
            User.find({ streak: { $gt: 0 } })
                .select("name streak totalAnalyses")
                .sort({ streak: -1 })
                .limit(5),
        ]);

        // Análisis por día de los últimos 7 días (agrupado)
        const Analysis = (await import("../models/analysis.model.js")).default;
        const analysesByDay = await Analysis.aggregate([
            { $match: { createdAt: { $gte: last7 } } },
            { $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "America/Lima" } },
                count: { $sum: 1 },
            }},
            { $sort: { _id: 1 } },
        ]);

        // Distribución por resultado (AUTHENTIC / SUSPICIOUS / MANIPULATED)
        const byResult = await Analysis.aggregate([
            { $match: { createdAt: { $gte: last30 } } },
            { $group: { _id: "$trustResult", count: { $sum: 1 } } },
        ]);

        res.json({
            success: true,
            stats: {
                totalUsers,
                activeToday,
                activeLast7,
                activeLast30,
                topStreaks: topStreaks.map(u => ({ name: u.name.split(' ')[0], streak: u.streak, totalAnalyses: u.totalAnalyses })),
                analysesByDay,
                byResult,
            },
        });
    } catch (err) {
        console.error("getAdminStats error:", err);
        res.status(500).json({ success: false, error: "Error obteniendo estadísticas" });
    }
};

/** Función interna — llamada desde analysis.controller al completar análisis */
export const recordAnalysisStreak = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        const now    = new Date();
        const nowStr = toLocalDayStr(now);
        const sameDay = user.todayDate === nowStr;

        if (sameDay) {
            // Mismo día: solo incrementar contadores
            await User.findByIdAndUpdate(userId, {
                $inc: { totalAnalyses: 1, todayAnalyses: 1 },
            });
            return;
        }

        // Nuevo día — calcular racha
        let newStreak;
        if (!user.lastAnalysisDate) {
            newStreak = 1;
        } else if (isConsecutiveDay(user.lastAnalysisDate, nowStr)) {
            newStreak = (user.streak || 0) + 1;
        } else {
            newStreak = 1; // racha rota
        }

        const newMax = Math.max(newStreak, user.maxStreak || 0);

        await User.findByIdAndUpdate(userId, {
            streak:           newStreak,
            maxStreak:        newMax,
            lastAnalysisDate: now,
            todayDate:        nowStr,
            todayAnalyses:    1,
            $inc:             { totalAnalyses: 1 },
        });

        console.log(`[streak] userId=${userId} day=${nowStr} streak=${newStreak}`);
    } catch (err) {
        console.error("recordAnalysisStreak error:", err);
    }
};

export const incrementAnalysisCount = recordAnalysisStreak;
