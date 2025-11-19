import { Router } from "express";
import { createLiveness, getLivenessResult } from "../controllers/facia.controller.js";

const router = Router();

router.post("/liveness", createLiveness);
router.post("/result", getLivenessResult);

export default router;
