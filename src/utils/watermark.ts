import sharp from "sharp";
import path from "node:path";
import { readFile } from "node:fs/promises";

/**
 * Stamps every uploaded photo with the Acme badge, normalises orientation/size
 * and converts to WebP.
 *
 * The badge sits in the CENTRE by default: the site crops photos to fit its cards
 * and gallery (object-cover), and a corner badge gets cut off on portrait/square
 * photos. A centred mark survives any crop and is also much harder to crop away.
 *
 * TO CHANGE THE WATERMARK: put your logo at `assets/watermark.png` (transparent
 * background) or `assets/watermark.svg` and restart the server. It is scaled to the
 * badge size below. With no file there, the built-in badge in `badge()` is used.
 *
 * Kept deliberately simple: one pass to resize (so the badge can be sized
 * relative to the final image), one pass to composite.
 */

/** Longest edge of a stored photo. Keeps uploads small without visible quality loss. */
const MAX_EDGE = 1600;

/** "center" (default) or "bottom-right". */
const POSITION: "center" | "bottom-right" = "center";
/** 0–1. How see-through the badge is. 1 = solid. */
const OPACITY = 0.6;
/** Badge width relative to the photo's shorter side, clamped to [BADGE_MIN, BADGE_MAX] px. */
const BADGE_RATIO = 0.5;
const BADGE_MIN = 180;
const BADGE_MAX = 640;
/** Gap from the edges when POSITION is "bottom-right". */
const MARGIN_RATIO = 0.022;

/** Checked in this order; the first one that exists wins. Read once, at the first upload. */
const LOGO_FILES = ["watermark.png", "watermark.svg"].map((f) => path.resolve(process.cwd(), "assets", f));

let logo: Promise<Buffer | null> | undefined;
function customLogo() {
  logo ??= (async () => {
    for (const file of LOGO_FILES) {
      try {
        return await readFile(file);
      } catch {
        // not there — try the next one
      }
    }
    return null;
  })();
  return logo;
}

export const WATERMARK_FORMAT = { ext: ".webp", contentType: "image/webp" };

function badge(width: number) {
  const height = Math.round(width * 0.26);
  const pad = Math.round(height * 0.2);
  const mark = height - pad * 2; // square logo mark
  const titleSize = Math.round(height * 0.38);
  const subSize = Math.round(height * 0.17);
  const textX = pad * 2 + mark;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="${Math.max(1, Math.round(height * 0.02))}" stdDeviation="${Math.max(
            1,
            Math.round(height * 0.03),
          )}" flood-color="#000" flood-opacity="0.45"/>
        </filter>
      </defs>
      <g filter="url(#s)" opacity="0.92">
        <rect x="0" y="0" width="${width}" height="${height}" rx="${Math.round(height * 0.22)}" fill="#014433" fill-opacity="0.78"/>
        <rect x="${pad}" y="${pad}" width="${mark}" height="${mark}" rx="${Math.round(mark * 0.22)}" fill="#F8D794"/>
        <path d="M ${pad + mark / 2} ${pad + mark * 0.18}
                 L ${pad + mark * 0.16} ${pad + mark * 0.47}
                 h ${mark * 0.08}
                 v ${mark * 0.35}
                 h ${mark * 0.18}
                 v ${mark * -0.2}
                 h ${mark * 0.12}
                 v ${mark * 0.2}
                 h ${mark * 0.18}
                 v ${mark * -0.35}
                 h ${mark * 0.08} Z" fill="#014433"/>
        <text x="${textX}" y="${pad + titleSize * 0.95}" font-family="Arial, Helvetica, sans-serif"
              font-size="${titleSize}" font-weight="700" fill="#F8D794" letter-spacing="${titleSize * 0.02}">ACME</text>
        <text x="${textX}" y="${height - pad - subSize * 0.35}" font-family="Arial, Helvetica, sans-serif"
              font-size="${subSize}" font-weight="500" fill="#FFFFFF" fill-opacity="0.9"
              letter-spacing="${subSize * 0.06}">HOMES AND PROPERTIES</text>
      </g>
    </svg>`,
  );
}

/** Multiplies a PNG's alpha channel by `opacity`. */
function fade(png: Buffer, opacity: number) {
  return sharp(png)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

export async function watermark(input: Buffer): Promise<Buffer> {
  const resized = await sharp(input, { failOn: "error" })
    .rotate() // honour EXIF orientation before we place the badge
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = resized.info;
  const badgeWidth = Math.min(
    width,
    Math.round(Math.min(BADGE_MAX, Math.max(BADGE_MIN, Math.min(width, height) * BADGE_RATIO))),
  );
  const file = await customLogo();
  const rendered = await sharp(file ?? badge(badgeWidth), { density: 300 })
    .resize({ width: badgeWidth, height, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const overlay = OPACITY < 1 ? await fade(rendered.data, OPACITY) : rendered.data;
  const { width: w, height: h } = rendered.info;
  const margin = Math.round(width * MARGIN_RATIO);

  const placement =
    POSITION === "center"
      ? { top: Math.round((height - h) / 2), left: Math.round((width - w) / 2) }
      : { top: Math.max(0, height - h - margin), left: Math.max(0, width - w - margin) };

  return sharp(resized.data)
    .composite([{ input: overlay, ...placement }])
    .webp({ quality: 82 })
    .toBuffer();
}
