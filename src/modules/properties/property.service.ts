import type { QueryFilter, SortOrder } from "mongoose";
import { Property, type IProperty } from "../../models/Property";
import type { ListQuery } from "./property.schema";

// Every sort puts properties that are still available before sold ones (isSold: false < true).
const SORTS: Record<ListQuery["sort"], Record<string, SortOrder>> = {
  newest: { isSold: 1, createdAt: -1 },
  oldest: { isSold: 1, createdAt: 1 },
  price_asc: { isSold: 1, price: 1 },
  price_desc: { isSold: 1, price: -1 },
  popular: { isSold: 1, views: -1 },
  /** Featured first, then newest — used by the home page so new listings show up straight away. */
  featured: { isSold: 1, isFeatured: -1, createdAt: -1 },
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
  if (q.sold !== undefined) filter.isSold = q.sold;
  if (q.city) filter["location.city"] = new RegExp(`^${escape(q.city)}$`, "i");
  if (q.area) filter["location.area"] = new RegExp(escape(q.area), "i");
  if (q.bedrooms !== undefined) filter.bedrooms = { $gte: q.bedrooms };
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const range = {
      ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}),
      ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}),
    };
    // A land listing matches if ANY plot size you can still buy fits the budget.
    // New array (not push) so a shared `extra.$and` is never mutated.
    filter.$and = [
      ...((filter.$and as QueryFilter<IProperty>[] | undefined) ?? []),
      {
        $or: [
          { plots: { $elemMatch: { isSoldOut: { $ne: true }, price: range } } },
          { "plots.0": { $exists: false }, price: range },
        ],
      },
    ];
  }
  if (q.q) {
    const rx = new RegExp(escape(q.q), "i");
    filter.$or = [{ title: rx }, { "location.area": rx }, { "location.city": rx }, { description: rx }];
  }
  return filter;
}

/**
 * `withOwner` is for dashboards only. Public responses never carry the agent's
 * details — buyers contact Acme, not the agent (see docs in the README).
 */
export async function paginate(
  filter: QueryFilter<IProperty>,
  q: Pick<ListQuery, "page" | "limit" | "sort">,
  { withOwner = false } = {},
) {
  const query = Property.find(filter)
    .sort(SORTS[q.sort])
    .skip((q.page - 1) * q.limit)
    .limit(q.limit);
  if (withOwner) query.populate("owner", "name agency phone email avatar isVerified");
  else query.select("-owner");

  const [items, total] = await Promise.all([
    query.lean(),
    Property.countDocuments(filter),
  ]);
  return {
    items,
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}
