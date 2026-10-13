import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Inquiry } from "../../models/Inquiry";
import { Property } from "../../models/Property";
import { ApiError } from "../../utils/ApiError";
import { validate } from "../../middleware/validate";
import { authorize, protect } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimit";

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().toLowerCase(),
  phone: z.string().trim().max(20).optional(),
  subject: z.string().trim().max(150).optional(),
  message: z.string().trim().min(5).max(3000),
  property: objectId.optional(),
});

/**
 * POST /inquiries — public: contact form or "enquire about this property".
 * Every enquiry lands in Acme's inbox, never the agent's, so a sale, lease or
 * rent can't be arranged behind the company.
 */
router.post(
  "/",
  rateLimit({ name: "inquiry", max: 10, windowSeconds: 60 * 60 }),
  validate({ body: createSchema }),
  async (_req: Request, res: Response) => {
    const body = res.locals.body as z.infer<typeof createSchema>;
    if (body.property && !(await Property.exists({ _id: body.property }))) {
      throw ApiError.notFound("Property not found");
    }
    const inquiry = await Inquiry.create(body); // no recipient: Acme handles every enquiry
    res.status(201).json({ success: true, data: { id: inquiry._id }, message: "Message sent. We'll get back to you shortly." });
  },
);

const listQuery = z.object({
  status: z.enum(["new", "read", "closed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /inquiries — admin only: enquiries are Acme's, not the agent's */
router.get("/", protect, authorize("admin"), validate({ query: listQuery }), async (_req: Request, res: Response) => {
  const { status, page, limit } = res.locals.query as z.infer<typeof listQuery>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Inquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("property", "title slug")
      .lean(),
    Inquiry.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } } });
});

/** PATCH /inquiries/:id — mark read / closed */
router.patch(
  "/:id",
  protect,
  authorize("admin"),
  validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(["new", "read", "closed"]) }) }),
  async (_req: Request, res: Response) => {
    const inquiry = await Inquiry.findById(res.locals.params.id);
    if (!inquiry) throw ApiError.notFound("Inquiry not found");
    inquiry.status = res.locals.body.status;
    await inquiry.save();
    res.json({ success: true, data: inquiry });
  },
);

export default router;
