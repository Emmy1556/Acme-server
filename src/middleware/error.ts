import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { ApiError } from "../utils/ApiError";
import { isProd } from "../config/env";

export const notFound: RequestHandler = (req) => {
  throw ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = "Something went wrong";
  let details: unknown;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = "Validation failed";
    details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [v.message]]));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err?.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue ?? {}).join(", ") || "Value"} already exists`;
  } else if (
    err?.name === "MaxRetriesPerRequestError" ||
    /enableOfflineQueue|Connection is closed/.test(err?.message ?? "")
  ) {
    // Redis dropped mid-request (sessions / rate limits live there)
    status = 503;
    message = "Service temporarily unavailable, please try again shortly";
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.message;
  }

  if (status >= 500) console.error(err);

  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(!isProd && status >= 500 ? { stack: err?.stack } : {}),
  });
};
