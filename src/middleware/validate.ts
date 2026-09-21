import type { RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { ApiError } from "../utils/ApiError";

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

/**
 * Validates and coerces request parts. Parsed values are stored on
 * `res.locals.body` / `res.locals.query` / `res.locals.params`
 * (Express 5 makes req.query read-only).
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, res, next) => {
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        throw ApiError.badRequest("Validation failed", z.flattenError(result.error).fieldErrors);
      }
      res.locals[part] = result.data;
    }
    next();
  };
