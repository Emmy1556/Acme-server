import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError";

/**
 * Local disk storage for development. Swap this for Cloudinary / S3
 * in production — only this file and `toImageUrl` need to change.
 */
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    // Extension comes from the validated MIME type, never the client's filename —
    // otherwise "evil.html" sent as image/png would be served back as HTML.
    const ext = EXT_BY_MIME[file.mimetype] ?? ".bin";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

export const uploadImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in EXT_BY_MIME) cb(null, true);
    else cb(ApiError.badRequest("Only JPEG, PNG, WEBP or AVIF images are allowed"));
  },
}).array("images", 10);

export const toImageUrl = (filename: string) => `/uploads/${filename}`;
