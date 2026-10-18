/**
 * Land photos are stored without the watermark. Their filenames end in this tag
 * so a building listing can refuse them (photos are uploaded before the listing
 * is saved, so someone could upload as "land" and then switch to "building").
 */
export const UNWATERMARKED_TAG = "-nw";

export const isUnwatermarked = (url: string) => /-nw\.\w+$/.test(url);
