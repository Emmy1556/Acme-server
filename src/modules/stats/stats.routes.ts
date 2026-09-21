import { Router, type Request, type Response } from "express";
import { Types } from "mongoose";
import { Property } from "../../models/Property";
import { User } from "../../models/User";
import { Inquiry } from "../../models/Inquiry";
import { authorize, protect } from "../../middleware/auth";

const router = Router();
router.use(protect);

async function listingBreakdown(match: Record<string, unknown>) {
  const [byStatus, byCategory, views] = await Promise.all([
    Property.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Property.aggregate([{ $match: match }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
    Property.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$views" } } }]),
  ]);
  const toMap = (rows: { _id: string; count: number }[]) => Object.fromEntries(rows.map((r) => [r._id, r.count]));
  return { byStatus: toMap(byStatus), byCategory: toMap(byCategory), totalViews: views[0]?.total ?? 0 };
}

/** GET /stats/admin */
router.get("/admin", authorize("admin"), async (_req: Request, res: Response) => {
  const [listings, users, agents, newInquiries] = await Promise.all([
    listingBreakdown({}),
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "agent" }),
    Inquiry.countDocuments({ status: "new" }),
  ]);
  res.json({ success: true, data: { listings, users, agents, newInquiries } });
});

/** GET /stats/agent */
router.get("/agent", authorize("agent", "admin"), async (req: Request, res: Response) => {
  const owner = new Types.ObjectId(req.user!.id);
  const [listings, newInquiries] = await Promise.all([
    listingBreakdown({ owner }),
    Inquiry.countDocuments({ recipient: owner, status: "new" }),
  ]);
  res.json({ success: true, data: { listings, newInquiries } });
});

export default router;
