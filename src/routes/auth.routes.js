import { Router } from "express";
import { getFaciaToken, register, login, getMe } from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/token", getFaciaToken);
router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);

export default router;