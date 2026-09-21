import Redis from "ioredis";
import { env } from "./env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  lazyConnect: true,
});

redis.on("error", (err) => console.error("Redis error:", err.message));

export async function connectRedis() {
  await redis.connect();
  console.log("✅ Redis connected");
}
