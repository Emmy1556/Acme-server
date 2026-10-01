import type { RequestHandler } from "express";
import { kv } from "../config/redis";
import { ApiError } from "../utils/ApiError";

/** Fixed-window rate limiter backed by Redis. Fails open if Redis is down. */
export const rateLimit =
  ({ name, max, windowSeconds }: { name: string; max: number; windowSeconds: number }): RequestHandler =>
  async (req, res, next) => {
    const key = `rl:${name}:${req.ip}`;
    try {
      const count = await kv.incr(key);
      if (count === 1) await kv.expire(key, windowSeconds);
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
      if (count > max) throw ApiError.tooMany();
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }
    next();
  };
