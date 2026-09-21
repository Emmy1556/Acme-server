import { Router } from "express";
import * as ctrl from "./auth.controller";
import { validate } from "../../middleware/validate";
import { protect } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimit";
import { changePasswordSchema, loginSchema, registerSchema, updateProfileSchema } from "./auth.schema";

const router = Router();
const authLimiter = rateLimit({ name: "auth", max: 20, windowSeconds: 15 * 60 });

router.post("/register", authLimiter, validate({ body: registerSchema }), ctrl.register);
router.post("/login", authLimiter, validate({ body: loginSchema }), ctrl.login);
router.post("/refresh", ctrl.refresh);
router.post("/logout", ctrl.logout);

router.get("/me", protect, ctrl.me);
router.patch("/me", protect, validate({ body: updateProfileSchema }), ctrl.updateProfile);
router.patch("/me/password", protect, validate({ body: changePasswordSchema }), ctrl.changePassword);

export default router;
