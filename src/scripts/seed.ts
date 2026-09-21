/**
 * Seeds an admin, a demo agent and sample listings (mirrors the reference site).
 * Usage: bun run seed            -> upserts admin/agent, adds listings if none exist
 *        bun run seed --fresh    -> wipes properties & inquiries first
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { env } from "../config/env";
import { User } from "../models/User";
import { Property } from "../models/Property";
import { Inquiry } from "../models/Inquiry";

const img = (id: string) => ({ url: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70` });
const HOUSE_IMGS = [
  "photo-1600596542815-ffad4c1539a9",
  "photo-1600585154340-be6161a56a0c",
  "photo-1512917774080-9991f1c4c750",
  "photo-1564013799919-ab600027ffc6",
  "photo-1613490493576-7fde63acd811",
  "photo-1580587771525-78b9dba3b914",
  "photo-1600607687939-ce8a6c25118c",
];
const LAND_IMGS = ["photo-1500382017468-9049fed747ef", "photo-1500076656116-558758c991c1"];

async function upsertUser(data: { name: string; email: string; password: string; role: "admin" | "agent"; agency?: string; phone?: string }) {
  let user = await User.findOne({ email: data.email });
  if (!user) {
    user = await User.create({ ...data, isVerified: true });
    console.log(`  + created ${data.role}: ${data.email} / ${data.password}`);
  } else {
    console.log(`  = ${data.role} exists: ${data.email}`);
  }
  return user;
}

async function main() {
  await connectDB();
  const fresh = process.argv.includes("--fresh");

  const admin = await upsertUser({
    name: "Acme Admin",
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
    role: "admin",
    phone: "+2347083107256",
  });
  const agent = await upsertUser({
    name: "Tunde Bakare",
    email: "agent@acmehomes.com",
    password: "Agent@12345",
    role: "agent",
    agency: "Bakare Realty",
    phone: "+2348000000000",
  });

  if (fresh) {
    await Promise.all([Property.deleteMany({}), Inquiry.deleteMany({})]);
    console.log("  ~ cleared properties & inquiries");
  }

  if ((await Property.countDocuments()) > 0) {
    console.log("  properties already present — skipping (use --fresh to reset)");
    return;
  }

  const lagos = (area: string) => ({ area, city: "Lagos", state: "Lagos" });
  const buildings = [
    { title: "Ace Estate", listingType: "sale", price: 10_000_000, location: lagos("Lekki Phase 1"), bedrooms: 3, bathrooms: 3, size: 110, buildingType: "terrace" },
    { title: "Adron Homes", listingType: "rent", price: 15_000_000, pricePeriod: "per_year", location: lagos("Lekki Phase 2"), bedrooms: 2, bathrooms: 2, size: 80, buildingType: "apartment" },
    { title: "Golden Estate", listingType: "sale", price: 50_000_000, location: lagos("Victoria Island"), bedrooms: 5, bathrooms: 5, size: 600, buildingType: "detached" },
    { title: "Star-Crest Homes", listingType: "rent", price: 35_000_000, pricePeriod: "per_year", location: lagos("Ajah"), bedrooms: 4, bathrooms: 4, size: 100, buildingType: "duplex" },
    { title: "Excellent Homes", listingType: "rent", price: 45_000_000, pricePeriod: "per_year", location: lagos("Epe"), bedrooms: 3, bathrooms: 4, size: 120, buildingType: "semi-detached" },
    { title: "Luminous Hills", listingType: "shortlet", price: 250_000, pricePeriod: "per_night", location: lagos("Ikoyi"), bedrooms: 5, bathrooms: 5, size: 700, buildingType: "penthouse" },
    { title: "Palm Court Residences", listingType: "lease", price: 60_000_000, pricePeriod: "per_year", location: lagos("Ikeja GRA"), bedrooms: 4, bathrooms: 5, size: 450, buildingType: "detached" },
  ].map((b, i) => ({
    ...b,
    category: "building",
    description: `${b.title} is a well-finished ${b.bedrooms}-bedroom ${b.buildingType} in ${b.location.area}, ${b.location.city}. Close to major roads, schools and shopping, with 24/7 security, steady power and ample parking.`,
    features: ["24/7 Security", "Parking", "Borehole", "Fitted Kitchen", "POP Ceiling"],
    parking: 2,
    toilets: (b.bathrooms ?? 1) + 1,
    images: [img(HOUSE_IMGS[i % HOUSE_IMGS.length]!), img(HOUSE_IMGS[(i + 1) % HOUSE_IMGS.length]!)],
    isFeatured: i < 6,
    owner: i % 2 === 0 ? admin._id : agent._id,
    status: "approved",
  }));

  const lands = [
    { title: "Crownwaters Estate", price: 500_000, size: 600, landUse: "residential", titleDocument: "Registered Survey & Deed of Assignment", location: lagos("Lekki") },
    { title: "1004sqm Of Dry Land With Good Access Road", price: 5_000_000, size: 1004, landUse: "agricultural", titleDocument: "C of O in View", location: lagos("Imota, Ikorodu") },
    { title: "Zenytal Gardens", price: 1_000_000, size: 500, landUse: "residential", titleDocument: "C of O in View", location: { area: "Odeda", city: "Abeokuta", state: "Ogun" } },
    { title: "Fortune Garden Estate Okpanam", price: 5_000_000, size: 500, landUse: "commercial", titleDocument: "C of O in View", location: { area: "Okpanam", city: "Asaba", state: "Delta" } },
    { title: "Riverside Commercial Plot", price: 45_000_000, size: 500, landUse: "commercial", titleDocument: "Family Receipt", location: lagos("Imota, Ikorodu") },
  ].map((l, i) => ({
    ...l,
    category: "land",
    listingType: "sale",
    description: `${l.size}sqm ${l.landUse} land at ${l.location.area}, ${l.location.city} with ${l.titleDocument}. Dry, accessible and ready for development.`,
    features: ["Good Access Road", "Dry Land", "Gated"],
    images: [img(LAND_IMGS[i % LAND_IMGS.length]!)],
    isFeatured: true,
    owner: admin._id,
    status: "approved",
  }));

  // a pending agent listing, so the admin moderation queue has something in it
  const pending = {
    title: "Sunset View Apartment",
    category: "building",
    listingType: "rent",
    price: 8_000_000,
    pricePeriod: "per_year",
    location: lagos("Yaba"),
    bedrooms: 2,
    bathrooms: 2,
    size: 90,
    buildingType: "apartment",
    description: "Newly built 2-bedroom apartment in Yaba, close to the tech hub and major bus stops.",
    features: ["Parking", "Prepaid Meter"],
    images: [img(HOUSE_IMGS[3]!)],
    owner: agent._id,
    status: "pending",
  };

  // create() one by one so the slug pre-save hook runs
  for (const p of [...buildings, ...lands, pending]) await Property.create(p as Record<string, unknown>);
  console.log(`  + created ${buildings.length + lands.length + 1} properties`);
}

main()
  .then(() => console.log("✅ Seed complete"))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
