import crypto from "node:crypto";
import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { env, isProd } from "../config/env";

/**
 * Where uploaded (already watermarked) photos are stored.
 *
 * - Cloudinary when CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET are set.
 * - Otherwise the local `uploads/` folder (development only — most hosts wipe
 *   their disk on every deploy).
 *
 * Talks to Cloudinary's REST API with signed requests, so there is no SDK to install.
 */

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const cloud =
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
    ? {
        name: env.CLOUDINARY_CLOUD_NAME,
        key: env.CLOUDINARY_API_KEY,
        secret: env.CLOUDINARY_API_SECRET,
        folder: env.CLOUDINARY_FOLDER,
      }
    : null;

export const usingCloudinary = cloud !== null;

if (!cloud && isProd) {
  console.warn("⚠️  Cloudinary is not configured — uploads are saved to local disk and will be lost on redeploy.");
}

export type StoredImage = { url: string; publicId?: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Our own Cloudinary URLs → public id. Anything else (other clouds, Unsplash…) → null. */
const cloudUrlRe = cloud
  ? new RegExp(
      `^https://res\\.cloudinary\\.com/${escapeRe(cloud.name)}/image/upload/(?:v\\d+/)?(${escapeRe(cloud.folder)}/[\\w-]+)\\.\\w+$`,
    )
  : null;

const localUrlRe = /^\/uploads\/([\w-]+\.\w+)$/;

function sign(params: Record<string, string>, secret: string) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(base + secret).digest("hex");
}

async function cloudinary(action: "upload" | "destroy", params: Record<string, string>, file?: Blob) {
  const c = cloud!;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signed = { ...params, timestamp };
  const form = new FormData();
  for (const [k, v] of Object.entries(signed)) form.append(k, v);
  form.append("api_key", c.key);
  form.append("signature", sign(signed, c.secret));
  if (file) form.append("file", file);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.name}/image/${action}`, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new Error(`Cloudinary ${action} failed (${res.status}): ${body.error?.message ?? "unknown error"}`);
  return body;
}

/**
 * Stores one finished image. The name is always generated here, never taken from the client.
 * `tag` is appended to the name (e.g. UNWATERMARKED_TAG for land photos).
 */
export async function storeImage(
  data: Buffer,
  file: { ext: string; contentType: string },
  tag = "",
): Promise<StoredImage> {
  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${tag}`;

  if (cloud) {
    const body = await cloudinary(
      "upload",
      { public_id: `${cloud.folder}/${name}` },
      new Blob([new Uint8Array(data)], { type: file.contentType }),
    );
    return { url: body.secure_url as string, publicId: body.public_id as string };
  }

  const filename = `${name}${file.ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), data);
  return { url: `/uploads/${filename}` };
}

/**
 * Deletes images we stored. URLs we don't own (seed/Unsplash, other clouds) are ignored.
 * Best-effort: failures are logged, never thrown — a leftover file is better than a failed request.
 */
export async function deleteImages(urls: string[]) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const publicId = cloudUrlRe?.exec(url)?.[1];
        if (publicId) {
          await cloudinary("destroy", { public_id: publicId, invalidate: "true" });
          return;
        }
        const filename = localUrlRe.exec(url)?.[1];
        if (filename) await unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
      } catch (err) {
        console.error(`Could not delete image ${url}:`, err);
      }
    }),
  );
}
