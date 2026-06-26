import { Router } from "express";
import { getStreak, getLeaderboard } from "../controllers/streak.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, getStreak);
router.get("/leaderboard", authMiddleware, getLeaderboard);
// Nota: no hay POST /checkin — la racha solo se actualiza al hacer un análisis

export default router;
