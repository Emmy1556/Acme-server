import { redis } from "../config/redis";

/**
 * Namespaced cache with version-based invalidation.
 * Bumping a namespace's version makes every key in it stale at once,
 * so we never need to SCAN/DEL on writes.
 */
async function version(ns: string) {
  return (await redis.get(`v:${ns}`)) ?? "1";
}

export const cache = {
  async get<T>(ns: string, key: string): Promise<T | null> {
    try {
      const raw = await redis.get(`c:${ns}:${await version(ns)}:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null; // cache is best-effort
    }
  },
  async set(ns: string, key: string, value: unknown, ttlSeconds = 300) {
    try {
      await redis.set(`c:${ns}:${await version(ns)}:${key}`, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      /* ignore */
    }
  },
  async invalidate(ns: string) {
    try {
      await redis.incr(`v:${ns}`);
    } catch {
      /* ignore */
    }
  },
};
