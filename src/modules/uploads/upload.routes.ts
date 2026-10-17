import { Router, type Request, type Response } from "express";
import { authorize, protect } from "../../middleware/auth";
import { saveWatermarked, uploadImages } from "../../middleware/upload";
import { ApiError } from "../../utils/ApiError";
import { deleteImages } from "../../utils/storage";

const router = Router();

/**
 * POST /uploads — multipart field "images" (max 10).
 * Every photo is watermarked with the Acme badge before it is stored.
 * Returns [{ url, publicId? }] to attach to a listing.
 */
router.post("/", protect, authorize("agent", "admin"), uploadImages, async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw ApiError.badRequest("No images uploaded");
  const results = await Promise.allSettled(files.map((file) => saveWatermarked(file)));
  const stored = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    // Don't leave the photos that did succeed sitting in storage with nothing pointing at them.
    await deleteImages(stored.map((img) => img.url));
    throw failed.reason;
  }
  res.status(201).json({ success: true, data: stored });
});

export default router;
