import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default("http://localhost:5174"),
  MONGO_URI: z.string().min(1),
  /** Leave empty in development to use the in-memory fallback. */
  REDIS_URL: z.string().default(""),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().default(7),
  /**
   * Cookie settings for the refresh token.
   * - Frontend and API on the same site (acmehomes.com + api.acmehomes.com, or proxied): "lax"
   * - Different sites (e.g. *.vercel.app + *.onrender.com): "none" (requires HTTPS; Safari may still block it)
   */
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),
  /** All three set → photos go to Cloudinary. Leave empty to store them on local disk (dev only). */
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_FOLDER: z
    .string()
    .regex(/^[\w-]+(\/[\w-]+)*$/, "letters, numbers, - and _ only, folders separated by /")
    .default("acme-homes"),
  SEED_ADMIN_EMAIL: z.string().default("admin@acmehomes.com"),
  SEED_ADMIN_PASSWORD: z.string().default("Admin@12345"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    z.flattenError(parsed.error).fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;

const cloudinaryVars = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const;
const cloudinarySet = cloudinaryVars.filter((k) => env[k]);
if (cloudinarySet.length && cloudinarySet.length < cloudinaryVars.length) {
  console.error(
    `❌ Cloudinary is half-configured. Set all of ${cloudinaryVars.join(", ")} or none. Missing: ${cloudinaryVars
      .filter((k) => !env[k])
      .join(", ")}`,
  );
  process.exit(1);
}

if (env.NODE_ENV === "production") {
  const weak = (["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const).filter(
    (k) => env[k].includes("change-me"),
  );
  if (weak.length) {
    console.error(
      `❌ Refusing to start: ${weak.join(", ")} still use the example value. Generate real secrets.`,
    );
    process.exit(1);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    console.error(
      "❌ Refusing to start: access and refresh secrets must be different.",
    );
    process.exit(1);
  }
}
export const isProd = env.NODE_ENV === "production";
