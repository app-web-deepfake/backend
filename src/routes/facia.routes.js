import { Router } from "express";
import { createLiveness, getLivenessResult } from "../controllers/facia.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/liveness", authMiddleware, createLiveness);
router.post("/result", authMiddleware, getLivenessResult);

export default router;
