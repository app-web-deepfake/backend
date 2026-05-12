import { Router } from "express";
import { saveFileData } from "../controllers/save.controller.js";

const router = Router();

router.post("/save", saveFileData);

export default router;
