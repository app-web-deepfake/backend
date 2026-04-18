import { Router } from "express";
import { getUserHistory } from "../controllers/historial.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, getUserHistory);

export default router;