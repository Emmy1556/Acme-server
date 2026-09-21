import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { env, isProd } from "./config/env";
import { redis } from "./config/redis";
import { UPLOAD_DIR } from "./middleware/upload";
import { errorHandler, notFound } from "./middleware/error";

import authRoutes from "./modules/auth/auth.routes";
import propertyRoutes from "./modules/properties/property.routes";
import userRoutes from "./modules/users/user.routes";
import inquiryRoutes from "./modules/inquiries/inquiry.routes";
import uploadRoutes from "./modules/uploads/upload.routes";
import statsRoutes from "./modules/stats/stats.routes";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.CLIENT_URL.split(","), credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
if (!isProd) app.use(morgan("dev"));

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      mongo: mongoose.connection.readyState === 1 ? "up" : "down",
      redis: redis.status === "ready" ? "up" : "down",
      uptime: Math.round(process.uptime()),
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/users", userRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/stats", statsRoutes);

app.use(notFound);
app.use(errorHandler);
