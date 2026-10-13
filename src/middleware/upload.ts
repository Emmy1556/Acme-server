import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { ApiError } from "../utils/ApiError";
import { WATERMARK_FORMAT, watermark } from "../utils/watermark";

/**
 * Local disk storage for development. Swap this for Cloudinary / S3
 * in production — only this file and `toImageUrl` need to change.
 */
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Files are held in memory so every photo can be watermarked before it ever
 * touches the disk — there is no un-watermarked copy to leak.
 */
export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest("Only JPEG, PNG, WEBP or AVIF images are allowed"));
  },
}).array("images", 10);

/** Watermarks one upload and stores it. Returns the public URL. */
export async function saveWatermarked(file: Express.Multer.File) {
  let data: Buffer;
  try {
    data = await watermark(file.buffer);
  } catch {
    // Wrong extension, truncated upload, or something that isn't really an image.
    throw ApiError.badRequest(`"${file.originalname}" could not be read as an image`);
  }
  // The name never comes from the client — an uploaded "evil.html" would otherwise
  // be served back as HTML from our own origin.
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${WATERMARK_FORMAT.ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), data);
  return toImageUrl(filename);
}

export const toImageUrl = (filename: string) => `/uploads/${filename}`;
