import { Document, Schema, model, type InferSchemaType } from "mongoose";
import slugify from "slugify";

export const CATEGORIES = ["building", "land"] as const;
export const LISTING_TYPES = ["sale", "rent", "lease", "shortlet"] as const;
export const BUILDING_TYPES = [
  "apartment",
  "duplex",
  "terrace",
  "bungalow",
  "detached",
  "semi-detached",
  "penthouse",
  "studio",
  "commercial",
] as const;
export const LAND_USES = ["residential", "commercial", "agricultural", "industrial", "mixed"] as const;
export const TITLE_DOCUMENTS = [
  "C of O",
  "C of O in View",
  "Governor's Consent",
  "Registered Survey",
  "Registered Survey & Deed of Assignment",
  "Deed of Assignment",
  "Excision",
  "Gazette",
  "Family Receipt",
] as const;
export const APPROVAL_STATUS = ["pending", "approved", "rejected"] as const;
export const PRICE_PERIODS = ["total", "per_year", "per_month", "per_night"] as const;

const imageSchema = new Schema({ url: { type: String, required: true }, publicId: String }, { _id: false });

/**
 * One size/price option on a land listing (e.g. 300sqm for ₦1m, 500sqm for ₦2m).
 * Keeps its _id so an enquiry can say which plot it's about, and a size can be
 * marked sold out on its own.
 */
const plotSchema = new Schema({
  size: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  isSoldOut: { type: Boolean, default: false },
  /** Free text, e.g. "₦300k deposit, balance over 6 months". */
  paymentPlan: { type: String, trim: true, maxlength: 200 },
});

type PlotLike = { _id?: unknown; size: number; price: number; isSoldOut?: boolean | null; paymentPlan?: string | null };

const propertySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, unique: true },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, enum: CATEGORIES, required: true, index: true },
    listingType: { type: String, enum: LISTING_TYPES, required: true, index: true },

    price: { type: Number, required: true, min: 0, index: true },
    currency: { type: String, default: "NGN" },
    pricePeriod: { type: String, enum: PRICE_PERIODS, default: "total" },

    location: {
      address: { type: String, trim: true },
      area: { type: String, required: true, trim: true }, // e.g. Lekki Phase 1
      city: { type: String, required: true, trim: true }, // e.g. Lagos
      state: { type: String, required: true, trim: true },
    },

    /** size in square metres (applies to both buildings and land) */
    size: { type: Number, min: 0 },

    // ----- building-only -----
    buildingType: { type: String, enum: BUILDING_TYPES },
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    toilets: { type: Number, min: 0 },
    parking: { type: Number, min: 0 },
    furnished: { type: Boolean, default: false },

    // ----- land-only -----
    landUse: { type: String, enum: LAND_USES },
    /** A plot often comes with several papers (e.g. Survey + Deed of Assignment). */
    titleDocuments: { type: [{ type: String, enum: TITLE_DOCUMENTS }], default: undefined },
    /** Size/price options. When present, `price`, `size`, `maxSize` and `isSold` are worked out from them. */
    plots: { type: [plotSchema], default: undefined },
    /** Largest plot size, for "300 – 1,000 sqm". Only set when sizes differ. */
    maxSize: Number,

    features: [{ type: String, trim: true }],
    images: { type: [imageSchema], default: [] },

    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: APPROVAL_STATUS, default: "pending", index: true },
    rejectionReason: String,
    isFeatured: { type: Boolean, default: false, index: true },
    isAvailable: { type: Boolean, default: true },
    /** Sold / let — stays public with a red badge so visitors can see Acme closing deals. */
    isSold: { type: Boolean, default: false, index: true },
    soldAt: Date,
    views: { type: Number, default: 0 },
  },
  { timestamps: true },
);

propertySchema.index({ "location.city": 1, "location.area": 1 });

const BUILDING_ONLY = ["buildingType", "bedrooms", "bathrooms", "toilets", "parking", "furnished"] as const;
const LAND_ONLY = ["landUse", "titleDocuments", "plots", "maxSize"] as const;

/**
 * Land with plot sizes: sorts them, and works out `price` (cheapest size still
 * available), `size`/`maxSize` (range) and `isSold` (every size sold out).
 * Runs before every save; exported for tests.
 */
export function applyPlots(doc: Document & Record<string, any>) {
  const plots = (doc.get("plots") as PlotLike[] | undefined) ?? [];
  if (doc.category === "land" && plots.length) {
    // Smallest first, whatever order they were typed in.
    // Plain objects (keeping each plot's _id) so the sorted list can be set back.
    const sorted = plots
      .map((p) => (p instanceof Document ? (p.toObject() as PlotLike) : p))
      .sort((a, b) => a.size - b.size || a.price - b.price);
    doc.set("plots", sorted);

    const open = sorted.filter((p) => !p.isSoldOut);
    // The card's "From ₦…" is the cheapest plot you can still buy.
    doc.price = Math.min(...(open.length ? open : sorted).map((p) => p.price));
    doc.size = sorted[0]!.size;
    const largest = sorted[sorted.length - 1]!.size;
    doc.maxSize = largest > doc.size ? largest : undefined;

    // Every size gone → the whole listing shows as sold (and back again if one frees up).
    const allGone = open.length === 0;
    if (allGone !== Boolean(doc.isSold)) {
      doc.isSold = allGone;
      doc.soldAt = allGone ? new Date() : undefined;
      doc.isAvailable = !allGone;
    }
  } else if (doc.category === "land") {
    doc.set("plots", undefined);
    doc.maxSize = undefined;
  }
}

propertySchema.pre("save", function () {
  // Switching building <-> land shouldn't leave stale fields behind.
  for (const f of this.category === "land" ? BUILDING_ONLY : LAND_ONLY) this.set(f, undefined);

  applyPlots(this);

  if (this.isModified("title") || !this.slug) {
    const base = slugify(this.title, { lower: true, strict: true });
    this.slug = `${base}-${this._id.toString().slice(-6)}`;
  }
});

export type IProperty = InferSchemaType<typeof propertySchema>;
export const Property = model("Property", propertySchema);
