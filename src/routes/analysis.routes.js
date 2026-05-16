import express from 'express';
import { startAnalysis, getAnalysisResult, checkAnalysisStatus } from '../controllers/analysis.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { submitFeedback, getFeedbackStats } from "../controllers/feedback.controller.js";


const router = express.Router();

router.post('/start', authMiddleware, startAnalysis);
router.post('/result', authMiddleware, getAnalysisResult);
router.get('/status/:referenceId', authMiddleware, checkAnalysisStatus);
router.post("/:referenceId/feedback", authMiddleware, submitFeedback);
router.get("/feedback-stats", authMiddleware, getFeedbackStats);

export default router;