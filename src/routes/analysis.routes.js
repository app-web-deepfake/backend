import express from 'express';
import { startAnalysis, getAnalysisResult, checkAnalysisStatus } from '../controllers/analysis.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/start', authMiddleware, startAnalysis);
router.post('/result', authMiddleware, getAnalysisResult);
router.get('/status/:referenceId', authMiddleware, checkAnalysisStatus);

export default router;