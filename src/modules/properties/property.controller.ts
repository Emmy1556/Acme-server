import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Property } from "../../models/Property";
import { Inquiry } from "../../models/Inquiry";
import { ApiError } from "../../utils/ApiError";
import { cache } from "../../utils/cache";
import { deleteImages } from "../../utils/storage";
import { buildFilter, paginate } from "./property.service";
import { crossFieldIssues, type ListQuery } from "./property.schema";

const NS = "properties";
const PUBLIC = { status: "approved", isAvailable: true } as const;

/** GET /properties — public, cached search */
export async function list(_req: Request, res: Response) {
  const q = res.locals.query as ListQuery;
  const key = JSON.stringify(q);
  const cached = await cache.get(NS, key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return void res.json({ success: true, data: cached });
  }
  const data = await paginate(buildFilter(q, PUBLIC), q);
  await cache.set(NS, key, data, 120);
  res.setHeader("X-Cache", "MISS");
  res.json({ success: true, data });
}

/** GET /properties/locations — distinct cities & areas for filter dropdowns */
export async function locations(_req: Request, res: Response) {
  const cached = await cache.get(NS, "locations");
  if (cached) return void res.json({ success: true, data: cached });
  const data = await Property.aggregate([
    { $match: PUBLIC },
    { $group: { _id: "$location.city", areas: { $addToSet: "$location.area" }, count: { $sum: 1 } } },
    { $project: { _id: 0, city: "$_id", areas: 1, count: 1 } },
    { $sort: { count: -1 } },
  ]);
  await cache.set(NS, "locations", data, 600);
  res.json({ success: true, data });
}

/** GET /properties/:slug — public detail (owners/admin can preview unapproved) */
export async function getBySlug(req: Request, res: Response) {
  const { slug } = res.locals.params;
  // Owner is never populated here: the public page contacts Acme, not the agent.
  const property = await Property.findOne({ slug });
  if (!property) throw ApiError.notFound("Property not found");

  const ownerId = property.owner.toString();
  const canPreview = req.user && (req.user.role === "admin" || req.user.id === ownerId);
  if (property.status !== "approved" && !canPreview) throw ApiError.notFound("Property not found");

  if (!canPreview) await Property.updateOne({ _id: property._id }, { $inc: { views: 1 } });

  const { owner: _owner, ...publicProperty } = property.toJSON();

  const similar = await Property.find({
    ...PUBLIC,
    _id: { $ne: property._id },
    category: property.category,
    "location.city": property.location?.city,
  })
    .limit(4)
    .select("title slug price pricePeriod listingType category location images bedrooms bathrooms size landUse titleDocument")
    .lean();

  res.json({ success: true, data: { property: publicProperty, similar } });
}

/** GET /properties/mine — agent/admin's own listings, any status */
export async function mine(req: Request, res: Response) {
  const q = res.locals.query as ListQuery;
  const data = await paginate(buildFilter(q, { owner: req.user!.id }), q);
  // Agents see how much interest a listing drew, but never who asked —
  // every enquiry goes to Acme.
  const counts = await Inquiry.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { property: { $in: data.items.map((p) => p._id) } } },
    { $group: { _id: "$property", count: { $sum: 1 } } },
  ]);
  const byProperty = new Map(counts.map((c) => [c._id.toString(), c.count]));
  const items = data.items.map((p) => ({ ...p, inquiryCount: byProperty.get(p._id.toString()) ?? 0 }));
  res.json({ success: true, data: { ...data, items } });
}

/** GET /properties/admin — admin: every listing, filter by status */
export async function adminList(_req: Request, res: Response) {
  const q = res.locals.query as ListQuery;
  const data = await paginate(buildFilter(q), q, { withOwner: true });
  res.json({ success: true, data });
}

/** POST /properties — agents' listings await approval; admin's go live immediately */
export async function create(req: Request, res: Response) {
  const isAdmin = req.user!.role === "admin";
  const property = await Property.create({
    ...res.locals.body,
    owner: req.user!.id,
    status: isAdmin ? "approved" : "pending",
  });
  await cache.invalidate(NS);
  res.status(201).json({ success: true, data: property });
}

/**
 * Deletes stored photos that no listing uses any more. The URL is checked against
 * every property, so copying another listing's photo URL and then deleting your own
 * listing can't remove someone else's image. Runs in the background.
 */
function releaseImages(urls: string[]) {
  if (!urls.length) return;
  void (async () => {
    const stillUsed = new Set(
      (await Property.find({ "images.url": { $in: urls } }).select("images.url").lean()).flatMap((p) =>
        p.images.map((i) => i.url),
      ),
    );
    await deleteImages(urls.filter((u) => !stillUsed.has(u)));
  })().catch((err) => console.error("Image cleanup failed:", err));
}

async function findOwned(req: Request, id: string) {
  const property = await Property.findById(id);
  if (!property) throw ApiError.notFound("Property not found");
  if (req.user!.role !== "admin" && property.owner.toString() !== req.user!.id) throw ApiError.forbidden();
  return property;
}

/** PATCH /properties/:id — edits by agents send the listing back for review */
export async function update(req: Request, res: Response) {
  const property = await findOwned(req, res.locals.params.id);
  const oldUrls = property.images.map((i) => i.url);
  property.set(res.locals.body);
  const issues = crossFieldIssues(property);
  if (issues.length) {
    throw ApiError.badRequest("Validation failed", Object.fromEntries(issues.map((i) => [i.path, [i.message]])));
  }
  if (req.user!.role !== "admin") {
    property.status = "pending";
    property.rejectionReason = undefined;
  }
  await property.save();
  await cache.invalidate(NS);
  const kept = new Set(property.images.map((i) => i.url));
  releaseImages(oldUrls.filter((u) => !kept.has(u)));
  res.json({ success: true, data: property });
}

/** DELETE /properties/:id */
export async function remove(req: Request, res: Response) {
  const property = await findOwned(req, res.locals.params.id);
  const urls = property.images.map((i) => i.url);
  await property.deleteOne();
  await cache.invalidate(NS);
  releaseImages(urls);
  res.json({ success: true, message: "Property deleted" });
}

/** PATCH /properties/:id/status — admin approve / reject */
export async function setStatus(_req: Request, res: Response) {
  const { status, rejectionReason } = res.locals.body;
  if (status === "rejected" && !rejectionReason) throw ApiError.badRequest("Please give a reason for rejection");
  const property = await Property.findByIdAndUpdate(
    res.locals.params.id,
    { status, rejectionReason: status === "rejected" ? rejectionReason : undefined },
    { returnDocument: "after" },
  );
  if (!property) throw ApiError.notFound("Property not found");
  await cache.invalidate(NS);
  res.json({ success: true, data: property });
}

/** PATCH /properties/:id/feature — admin toggles "featured" on the home page */
export async function setFeatured(_req: Request, res: Response) {
  const property = await Property.findByIdAndUpdate(
    res.locals.params.id,
    { isFeatured: res.locals.body.isFeatured },
    { returnDocument: "after" },
  );
  if (!property) throw ApiError.notFound("Property not found");
  await cache.invalidate(NS);
  res.json({ success: true, data: property });
}
