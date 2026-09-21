import { Router } from "express";
import * as ctrl from "./property.controller";
import { validate } from "../../middleware/validate";
import { authorize, optionalAuth, protect } from "../../middleware/auth";
import {
  adminListQuerySchema,
  createPropertySchema,
  featureSchema,
  idParams,
  listQuerySchema,
  slugParams,
  statusSchema,
  updatePropertySchema,
} from "./property.schema";

const router = Router();

// ---- public ----
router.get("/", validate({ query: listQuerySchema }), ctrl.list);
router.get("/locations", ctrl.locations);

// ---- agent / admin ----
router.get("/mine", protect, authorize("agent", "admin"), validate({ query: adminListQuerySchema }), ctrl.mine);
router.get("/admin", protect, authorize("admin"), validate({ query: adminListQuerySchema }), ctrl.adminList);
router.post("/", protect, authorize("agent", "admin"), validate({ body: createPropertySchema }), ctrl.create);
router.patch(
  "/:id",
  protect,
  authorize("agent", "admin"),
  validate({ params: idParams, body: updatePropertySchema }),
  ctrl.update,
);
router.delete("/:id", protect, authorize("agent", "admin"), validate({ params: idParams }), ctrl.remove);

// ---- admin moderation ----
router.patch("/:id/status", protect, authorize("admin"), validate({ params: idParams, body: statusSchema }), ctrl.setStatus);
router.patch("/:id/feature", protect, authorize("admin"), validate({ params: idParams, body: featureSchema }), ctrl.setFeatured);

// keep last: catches /:slug
router.get("/:slug", optionalAuth, validate({ params: slugParams }), ctrl.getBySlug);

export default router;
