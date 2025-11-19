import express from 'express';
import {
    startAnalysis,
    getAnalysisResult,
    checkAnalysisStatus
} from '../controllers/analysis.controller.js';

const router = express.Router();

router.post('/start', startAnalysis);           // /api/analysis/start
router.post('/result', getAnalysisResult);      // /api/analysis/result
router.get('/status/:referenceId', checkAnalysisStatus);  // /api/analysis/status/:id

export default router;