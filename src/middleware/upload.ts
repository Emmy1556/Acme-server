import multer from "multer";
import { ApiError } from "../utils/ApiError";
import { storeImage } from "../utils/storage";
import { WATERMARK_FORMAT, watermark } from "../utils/watermark";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Files are held in memory so every photo can be watermarked before it is stored
 * anywhere (Cloudinary or local disk) — there is no un-watermarked copy to leak.
 */
export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest("Only JPEG, PNG, WEBP or AVIF images are allowed"));
  },
}).array("images", 10);

/** Watermarks one upload and stores it. Returns { url, publicId? }. */
export async function saveWatermarked(file: Express.Multer.File) {
  let data: Buffer;
  try {
    data = await watermark(file.buffer);
  } catch {
    // Wrong extension, truncated upload, or something that isn't really an image.
    throw ApiError.badRequest(`"${file.originalname}" could not be read as an image`);
  }
  return storeImage(data, WATERMARK_FORMAT);
}
