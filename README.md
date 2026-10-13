# Acme Homes — Backend (acme-backend)

REST API for the Acme Homes and Properties platform.
Node 22 + TypeScript · Express 5 · MongoDB (Mongoose) · Redis (ioredis) · Zod · JWT.

Frontend lives in a separate repo: **acme-frontend**.

## Run locally

Needs **Bun** (installs/scripts), **Node ≥ 22.9** (runtime), MongoDB, and Redis (optional in development — see below).

```bash
docker compose up -d          # MongoDB + Redis (or use local installs / Atlas / Upstash)
bun install
cp .env.example .env          # set real JWT secrets
bun run seed                  # admin + demo agent + sample listings  (--fresh to reset)
bun run dev                   # http://localhost:5000/api
```

### Redis on Windows

Redis doesn't ship for Windows, so pick one — or skip it: in development the API falls back to an
in-memory store automatically (you'll see a ⚠️ warning; sessions just reset when the server restarts).

- **Docker Desktop:** `docker compose up -d` (also starts MongoDB).
- **WSL:** `sudo apt install redis-server && sudo service redis-server start` — WSL forwards `localhost:6379` to Windows.
- **Memurai:** a Redis-compatible Windows service (free Developer edition), runs on `localhost:6379`.
- **Upstash:** free hosted Redis — set `REDIS_URL=rediss://default:<password>@<host>:6379`.

`GET /api/health` shows `"redis": "up"`, `"down"` or `"memory-fallback"`.

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
- **Uploads:** `POST /api/uploads` writes to `./uploads` (dev only — see Deploying). Every photo is resized
  (max 1600px), converted to WebP and stamped with the Acme badge in the bottom-right corner before it is
  saved — no un-watermarked copy is ever stored. The badge is drawn in `src/utils/watermark.ts`.
- **All contact goes through Acme:** public responses never include the agent's name, phone or email, and every
  enquiry lands in the admin inbox. Agents see how many enquiries each listing attracted, never who sent them,
  so a sale, lease or rent can't be arranged behind the company.

## Deploying

1. Set `NODE_ENV=production`, real `JWT_*` secrets, `MONGO_URI`, `REDIS_URL`, and `CLIENT_URL` (your frontend origin).
2. **Cookies across two deployments:** the refresh cookie only works reliably if the frontend and API are on the *same site*:
   - best: `acmehomes.com` (frontend) + `api.acmehomes.com` (API) → `COOKIE_SAMESITE=lax`, or
   - proxy `/api` through the frontend host (see acme-frontend `vercel.json`) → `lax`.
   - different sites (e.g. `*.vercel.app` + `*.onrender.com`) → `COOKIE_SAMESITE=none`; works in Chrome but Safari blocks third-party cookies, so users get logged out on refresh.
3. **Images:** most hosts have an ephemeral disk — uploads vanish on redeploy. Move `src/middleware/upload.ts` to Cloudinary/S3 before launch (keep the `watermark()` call — watermark first, then upload).
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
| POST | `/uploads` (multipart `images`, ≤10 × 8 MB, watermarked) | agent, admin |
| POST | `/inquiries` | public (rate limited) |
| GET · PATCH | `/inquiries` · `/inquiries/:id` | admin |
| GET · PATCH · DELETE | `/users` · `/users/:id` | admin |
| GET | `/stats/agent` · `/stats/admin` | agent · admin |
| GET | `/health` | public |

Responses: `{ success: true, data }` or `{ success: false, message, details? }`.
