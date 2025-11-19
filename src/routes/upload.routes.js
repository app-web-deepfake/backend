import { Router } from "express";
import {getPresignedUrl} from "../controllers/files.controller.js";

const router = Router();

router.post('/upload-url', getPresignedUrl);

export default router;