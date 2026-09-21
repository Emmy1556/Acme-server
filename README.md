# Acme Homes — Backend (acme-backend)

REST API for the Acme Homes and Properties platform.
Node 22 + TypeScript · Express 5 · MongoDB (Mongoose) · Redis (ioredis) · Zod · JWT.

Frontend lives in a separate repo: **acme-frontend**.

## Run locally

Needs **Bun** (installs/scripts), **Node ≥ 22.9** (runtime), MongoDB and Redis.

```bash
docker compose up -d          # MongoDB + Redis (or use local installs / Atlas / Upstash)
bun install
cp .env.example .env          # set real JWT secrets
bun run seed                  # admin + demo agent + sample listings  (--fresh to reset)
bun run dev                   # http://localhost:5000/api
```

| Script | What it does |
|---|---|
| `bun run dev` | watch mode (tsx) |
| `bun run build` | bundle to `dist/` (tsup) |
| `bun run start` | run the build (`node dist/index.js`) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run seed` | seed data |

> Runs on Node rather than Bun's runtime: the MongoDB driver (`bson`) calls a `node:v8` API Bun hasn't implemented yet.

Seeded logins: `admin@acmehomes.com / Admin@12345`, `agent@acmehomes.com / Agent@12345` — **change or delete these before going live**.

## Design notes

- **Roles:** `user`, `agent` (agents & landlords), `admin`. Public sign-up can only create `user` / `agent`.
- **Listing workflow:** agent posts → `pending` → admin approves or rejects (reason required). Editing sends it back to `pending`. Admin posts are live immediately; admins can feature listings for the home page.
- **Auth:** 15-min access JWT (client keeps it in memory) + rotating refresh token in an httpOnly cookie, tracked in Redis. Deactivating a user, changing their role or changing a password revokes all their sessions immediately.
- **Redis:** refresh tokens + revocation, versioned cache for public listing queries, rate limiting on auth and enquiries.
- **Uploads:** `POST /api/uploads` writes to `./uploads` (dev only — see Deploying).

## Deploying

1. Set `NODE_ENV=production`, real `JWT_*` secrets, `MONGO_URI`, `REDIS_URL`, and `CLIENT_URL` (your frontend origin).
2. **Cookies across two deployments:** the refresh cookie only works reliably if the frontend and API are on the *same site*:
   - best: `acmehomes.com` (frontend) + `api.acmehomes.com` (API) → `COOKIE_SAMESITE=lax`, or
   - proxy `/api` through the frontend host (see acme-frontend `vercel.json`) → `lax`.
   - different sites (e.g. `*.vercel.app` + `*.onrender.com`) → `COOKIE_SAMESITE=none`; works in Chrome but Safari blocks third-party cookies, so users get logged out on refresh.
3. **Images:** most hosts have an ephemeral disk — uploads vanish on redeploy. Move `src/middleware/upload.ts` to Cloudinary/S3 before launch.
4. Run behind HTTPS. `trust proxy` is set to 1 hop.

## API (`/api`)

| Method | Path | Access |
|---|---|---|
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | public |
| GET · PATCH | `/auth/me` · PATCH `/auth/me/password` | signed in |
| GET | `/properties` — filters: category, listingType, buildingType, landUse, city, area, minPrice, maxPrice, bedrooms, q, featured, sort, page, limit | public |
| GET | `/properties/locations` · `/properties/:slug` | public (owner/admin can preview unapproved) |
| GET | `/properties/mine` | agent, admin |
| POST · PATCH · DELETE | `/properties` · `/properties/:id` | owner or admin |
| GET | `/properties/admin?status=` | admin |
| PATCH | `/properties/:id/status` · `/properties/:id/feature` | admin |
| POST | `/uploads` (multipart `images`, ≤10 × 5 MB) | agent, admin |
| POST | `/inquiries` | public (rate limited) |
| GET · PATCH | `/inquiries` · `/inquiries/:id` | agent (own), admin |
| GET · PATCH · DELETE | `/users` · `/users/:id` | admin |
| GET | `/stats/agent` · `/stats/admin` | agent · admin |
| GET | `/health` | public |

Responses: `{ success: true, data }` or `{ success: false, message, details? }`.
