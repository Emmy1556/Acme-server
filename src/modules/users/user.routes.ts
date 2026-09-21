import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { User, ROLES } from "../../models/User";
import { Property } from "../../models/Property";
import { ApiError } from "../../utils/ApiError";
import { cache } from "../../utils/cache";
import { revokeAllSessions } from "../../utils/tokens";
import { validate } from "../../middleware/validate";
import { authorize, protect } from "../../middleware/auth";

const router = Router();
router.use(protect, authorize("admin"));

const listQuery = z.object({
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateSchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
});

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });

/** GET /users — admin: list/search users */
router.get("/", validate({ query: listQuery }), async (_req: Request, res: Response) => {
  const { role, q, page, limit } = res.locals.query as z.infer<typeof listQuery>;
  const filter: Record<string, unknown> = {};
  if (role) filter.role = role;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { email: rx }, { agency: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } } });
});

/** PATCH /users/:id — admin: change role, (de)activate, verify agent */
router.patch("/:id", validate({ params: idParams, body: updateSchema }), async (req: Request, res: Response) => {
  const { id } = res.locals.params;
  if (id === req.user!.id && res.locals.body.role && res.locals.body.role !== "admin") {
    throw ApiError.badRequest("You cannot remove your own admin role");
  }
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound("User not found");
  const roleChanged = res.locals.body.role !== undefined && res.locals.body.role !== user.role;
  user.set(res.locals.body);
  await user.save();
  // Role changes and deactivation must take effect now, not when the current token expires.
  if (roleChanged || res.locals.body.isActive === false) await revokeAllSessions(id);
  res.json({ success: true, data: user });
});

/** DELETE /users/:id — admin: remove a user and their listings */
router.delete("/:id", validate({ params: idParams }), async (req: Request, res: Response) => {
  const { id } = res.locals.params;
  if (id === req.user!.id) throw ApiError.badRequest("You cannot delete your own account");
  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound("User not found");
  await Property.deleteMany({ owner: id });
  await revokeAllSessions(id);
  await cache.invalidate("properties");
  res.json({ success: true, message: "User deleted" });
});

export default router;
