import { Router } from "express";
import { getFaciaToken } from "../controllers/auth.controller.js";

const router = Router();

router.post("/token", getFaciaToken);

export default router;
