import { Router } from "express";
import { getStreak, getLeaderboard, getAdminStats } from "../controllers/streak.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/",             authMiddleware, getStreak);
router.get("/leaderboard",  authMiddleware, getLeaderboard);
router.get("/admin/stats",  authMiddleware, getAdminStats);   // admin verifica role en el frontend

export default router;
