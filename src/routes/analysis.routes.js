import express from 'express';
import {
    startAnalysis,
    getAnalysisResult,
    checkAnalysisStatus
} from '../controllers/analysis.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/start', optionalAuth, startAnalysis);
router.post('/result', optionalAuth, getAnalysisResult);
router.get('/status/:referenceId', checkAnalysisStatus);

export default router;