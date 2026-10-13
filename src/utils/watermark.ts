import sharp from "sharp";

/**
 * Stamps every uploaded photo with an Acme badge in the bottom-right corner,
 * normalises orientation/size and converts to WebP.
 *
 * Kept deliberately simple: one pass to resize (so the badge can be sized
 * relative to the final image), one pass to composite.
 */

/** Longest edge of a stored photo. Keeps uploads small without visible quality loss. */
const MAX_WIDTH = 1600;
const BADGE_RATIO = 0.3; // badge width relative to the photo width
const BADGE_MIN = 150;
const BADGE_MAX = 440;
const MARGIN_RATIO = 0.022;

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

export async function watermark(input: Buffer): Promise<Buffer> {
  const resized = await sharp(input, { failOn: "error" })
    .rotate() // honour EXIF orientation before we place the badge
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = resized.info;
  const badgeWidth = Math.round(Math.min(BADGE_MAX, Math.max(BADGE_MIN, width * BADGE_RATIO)));
  const overlay = badge(badgeWidth);
  const { height: badgeHeight } = await sharp(overlay).metadata();
  const margin = Math.round(width * MARGIN_RATIO);

  return sharp(resized.data)
    .composite([
      {
        input: overlay,
        top: Math.max(0, height - (badgeHeight ?? 0) - margin),
        left: Math.max(0, width - badgeWidth - margin),
      },
    ])
    .webp({ quality: 82 })
    .toBuffer();
}
