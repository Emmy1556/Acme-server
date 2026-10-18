# Watermark logo

Every uploaded listing photo is stamped with `watermark.png` (the Acme logo) in the bottom-right corner,
on a translucent green plate so the white text stays readable on bright photos.

- To change the logo, replace `watermark.png` here (transparent background) — or add `watermark.svg` — then restart the server.
- Delete the file to fall back to the built-in badge in `src/utils/watermark.ts`.
- Position, size, transparency and the plate: `POSITION`, `BADGE_RATIO`, `BADGE_MIN`, `BADGE_MAX`, `OPACITY`, `PLATE_OPACITY`, `PLATE_COLOR` in `src/utils/watermark.ts`.

Only new uploads get the new watermark — existing photos keep the one they were uploaded with.
