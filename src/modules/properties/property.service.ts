import type { QueryFilter, SortOrder } from "mongoose";
import { Property, type IProperty } from "../../models/Property";
import type { ListQuery } from "./property.schema";

const SORTS: Record<ListQuery["sort"], Record<string, SortOrder>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  popular: { views: -1 },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildFilter(q: Partial<ListQuery>, extra: QueryFilter<IProperty> = {}) {
  const filter: QueryFilter<IProperty> = { ...extra };
  if (q.category) filter.category = q.category;
  if (q.listingType) filter.listingType = q.listingType;
  if (q.buildingType) filter.buildingType = q.buildingType;
  if (q.landUse) filter.landUse = q.landUse;
  if (q.status) filter.status = q.status;
  if (q.featured !== undefined) filter.isFeatured = q.featured;
  if (q.city) filter["location.city"] = new RegExp(`^${escape(q.city)}$`, "i");
  if (q.area) filter["location.area"] = new RegExp(escape(q.area), "i");
  if (q.bedrooms !== undefined) filter.bedrooms = { $gte: q.bedrooms };
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.price = {
      ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}),
      ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}),
    };
  }
  if (q.q) {
    const rx = new RegExp(escape(q.q), "i");
    filter.$or = [{ title: rx }, { "location.area": rx }, { "location.city": rx }, { description: rx }];
  }
  return filter;
}

export async function paginate(filter: QueryFilter<IProperty>, q: Pick<ListQuery, "page" | "limit" | "sort">) {
  const [items, total] = await Promise.all([
    Property.find(filter)
      .sort(SORTS[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate("owner", "name agency phone email avatar isVerified")
      .lean(),
    Property.countDocuments(filter),
  ]);
  return {
    items,
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}
