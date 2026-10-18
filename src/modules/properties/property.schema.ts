import { z } from "zod";
import {
  APPROVAL_STATUS,
  BUILDING_TYPES,
  CATEGORIES,
  LAND_USES,
  LISTING_TYPES,
  PRICE_PERIODS,
  TITLE_DOCUMENTS,
} from "../../models/Property";
import { isUnwatermarked } from "../../utils/imageTags";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

/** Only our own uploads or https URLs — never arbitrary schemes. */
const imageSchema = z.object({
  url: z
    .string()
    .max(500)
    .refine((u) => /^\/uploads\/[\w.-]+$/.test(u) || /^https:\/\/\S+$/.test(u), "Invalid image URL"),
  publicId: z.string().max(200).optional(),
});

// NOTE: no .default() in `base` — zod applies defaults inside .partial(), which would
// silently reset fields (e.g. wipe images) on every PATCH. Defaults live in createPropertySchema.
const base = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(CATEGORIES),
  listingType: z.enum(LISTING_TYPES),
  price: z.coerce.number().nonnegative(),
  pricePeriod: z.enum(PRICE_PERIODS),
  location: z.object({
    address: z.string().trim().max(200).optional(),
    area: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
  }),
  size: z.coerce.number().nonnegative().optional(),

  buildingType: z.enum(BUILDING_TYPES).optional(),
  bedrooms: z.coerce.number().int().nonnegative().optional(),
  bathrooms: z.coerce.number().int().nonnegative().optional(),
  toilets: z.coerce.number().int().nonnegative().optional(),
  parking: z.coerce.number().int().nonnegative().optional(),
  furnished: z.boolean().optional(),

  landUse: z.enum(LAND_USES).optional(),
  plots: z
    .array(
      z.object({
        _id: objectId.optional(),
        size: z.coerce.number().positive("Plot size must be more than 0").max(100_000_000),
        price: z.coerce.number().nonnegative(),
        isSoldOut: z.boolean().optional(),
        paymentPlan: z.string().trim().max(200).optional(),
      }),
    )
    .max(30, "At most 30 plot sizes")
    .optional(),
  titleDocuments: z
    .array(z.enum(TITLE_DOCUMENTS))
    .max(TITLE_DOCUMENTS.length)
    .transform((docs) => [...new Set(docs)])
    .optional(),

  features: z.array(z.string().trim().min(1).max(60)).max(30),
  images: z.array(imageSchema).max(25, "A listing can have at most 25 photos"),
  isAvailable: z.boolean().optional(),
});

type CrossFields = {
  category?: string;
  listingType?: string;
  landUse?: string | null;
  bedrooms?: number | null;
  images?: { url: string }[] | null;
};

/** Rules that depend on more than one field. Used on create, and on the merged document on update. */
export function crossFieldIssues(d: CrossFields) {
  const issues: { path: string; message: string }[] = [];
  if (d.category === "land" && d.listingType === "shortlet")
    issues.push({ path: "listingType", message: "Land cannot be listed as a short-let" });
  if (d.category === "land" && !d.landUse)
    issues.push({ path: "landUse", message: "Land use is required for land listings" });
  if (d.category === "building" && (d.bedrooms === undefined || d.bedrooms === null))
    issues.push({ path: "bedrooms", message: "Bedrooms is required for buildings" });
  if (d.category === "building" && d.images?.some((i) => isUnwatermarked(i.url)))
    issues.push({
      path: "images",
      message: "Some photos were uploaded for a land listing and have no watermark. Remove them and upload them again.",
    });
  return issues;
}

export const createPropertySchema = base
  .extend({
    pricePeriod: base.shape.pricePeriod.default("total"),
    features: base.shape.features.default([]),
    images: base.shape.images.default([]),
  })
  .superRefine((d, ctx) => {
    for (const i of crossFieldIssues(d)) ctx.addIssue({ code: "custom", path: [i.path], message: i.message });
  });

export const updatePropertySchema = base.partial();

export const listQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
  buildingType: z.enum(BUILDING_TYPES).optional(),
  landUse: z.enum(LAND_USES).optional(),
  city: z.string().trim().optional(),
  area: z.string().trim().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  bedrooms: z.coerce.number().int().nonnegative().optional(),
  q: z.string().trim().max(100).optional(),
  featured: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sold: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc", "popular", "featured"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const adminListQuerySchema = listQuerySchema.extend({
  status: z.enum(APPROVAL_STATUS).optional(),
});

export const statusSchema = z.object({
  status: z.enum(APPROVAL_STATUS),
  rejectionReason: z.string().trim().max(500).optional(),
});

export const featureSchema = z.object({ isFeatured: z.boolean() });
export const soldSchema = z.object({ isSold: z.boolean() });
/** The ids of the plot sizes that are sold out; every other size becomes available. */
export const plotsSoldOutSchema = z.object({ soldOut: z.array(objectId).max(30) });

export const idParams = z.object({ id: objectId });
export const slugParams = z.object({ slug: z.string().min(1).max(200) });

export type ListQuery = z.infer<typeof adminListQuerySchema>;
