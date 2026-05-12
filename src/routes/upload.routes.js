import { Router } from "express";
import { getPresignedUrl } from "../controllers/files.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post('/upload-url', authMiddleware, getPresignedUrl);

export default router;