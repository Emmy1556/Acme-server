import { Schema, model, type InferSchemaType } from "mongoose";
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
    titleDocument: { type: String, enum: TITLE_DOCUMENTS },

    features: [{ type: String, trim: true }],
    images: { type: [imageSchema], default: [] },

    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: APPROVAL_STATUS, default: "pending", index: true },
    rejectionReason: String,
    isFeatured: { type: Boolean, default: false, index: true },
    isAvailable: { type: Boolean, default: true },
    views: { type: Number, default: 0 },
  },
  { timestamps: true },
);

propertySchema.index({ "location.city": 1, "location.area": 1 });

const BUILDING_ONLY = ["buildingType", "bedrooms", "bathrooms", "toilets", "parking", "furnished"] as const;
const LAND_ONLY = ["landUse", "titleDocument"] as const;

propertySchema.pre("save", function () {
  // Switching building <-> land shouldn't leave stale fields behind.
  for (const f of this.category === "land" ? BUILDING_ONLY : LAND_ONLY) this.set(f, undefined);

  if (this.isModified("title") || !this.slug) {
    const base = slugify(this.title, { lower: true, strict: true });
    this.slug = `${base}-${this._id.toString().slice(-6)}`;
  }
});

export type IProperty = InferSchemaType<typeof propertySchema>;
export const Property = model("Property", propertySchema);
