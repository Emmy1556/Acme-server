import { Router, type Request, type Response } from "express";
import { authorize, protect } from "../../middleware/auth";
import { toImageUrl, uploadImages } from "../../middleware/upload";
import { ApiError } from "../../utils/ApiError";

const router = Router();

/** POST /uploads — multipart field "images" (max 10). Returns [{ url }] to attach to a listing. */
router.post("/", protect, authorize("agent", "admin"), uploadImages, (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw ApiError.badRequest("No images uploaded");
  res.status(201).json({ success: true, data: files.map((f) => ({ url: toImageUrl(f.filename) })) });
});

export default router;
