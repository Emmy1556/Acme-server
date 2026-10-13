import { Router, type Request, type Response } from "express";
import { authorize, protect } from "../../middleware/auth";
import { saveWatermarked, uploadImages } from "../../middleware/upload";
import { ApiError } from "../../utils/ApiError";

const router = Router();

/**
 * POST /uploads — multipart field "images" (max 10).
 * Every photo is watermarked with the Acme badge before it is stored.
 * Returns [{ url }] to attach to a listing.
 */
router.post("/", protect, authorize("agent", "admin"), uploadImages, async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw ApiError.badRequest("No images uploaded");
  const urls = await Promise.all(files.map(async (file) => ({ url: await saveWatermarked(file) })));
  res.status(201).json({ success: true, data: urls });
});

export default router;
