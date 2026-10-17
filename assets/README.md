# Watermark logo

Every uploaded listing photo is stamped with a logo in the bottom-right corner.

- To use your own logo, save it here as `watermark.png` (transparent background) or `watermark.svg`, then restart the server.
- With no file here, the built-in Acme badge from `src/utils/watermark.ts` is used.
- Size and position: `BADGE_RATIO`, `BADGE_MIN`, `BADGE_MAX` and `MARGIN_RATIO` in `src/utils/watermark.ts`.

A wide logo (roughly 4:1, like the current badge) works best. Only new uploads get the new watermark — existing photos keep the old one.
