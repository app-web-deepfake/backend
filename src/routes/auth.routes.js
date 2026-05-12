import { Router } from "express";
import {
    register,
    login,
    getMe,
    getFaciaToken,
    verifyEmail,
    forgotPassword,
    resetPassword,
    changePassword,
    updateProfile,
    resendVerification,
    sendSuggestion,
} from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// Public
router.post("/register", register);
router.post("/login", login);
router.get("/verify-email/:token", verifyEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected
router.get("/me", authMiddleware, getMe);
router.post("/token", authMiddleware, getFaciaToken);
router.put("/change-password", authMiddleware, changePassword);
router.put("/profile", authMiddleware, updateProfile);
router.post("/resend-verification", authMiddleware, resendVerification);
router.post("/suggestion", authMiddleware, sendSuggestion);

export default router;