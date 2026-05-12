import { Router } from "express";
import { getUserHistory, deleteAnalysis, deleteAllAnalysis } from "../controllers/historial.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, getUserHistory);
router.delete("/:id", authMiddleware, deleteAnalysis);
router.delete("/", authMiddleware, deleteAllAnalysis);

export default router;