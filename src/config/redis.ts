import Redis from "ioredis";
import { env, isProd } from "./env";

/**
 * The small key-value surface the app needs (sessions, cache, rate limits).
 * Backed by Redis; in development it falls back to an in-memory store when Redis
 * isn't reachable, so the API still works on a machine without Redis installed.
 */
export interface KV {
  readonly backend: "redis" | "memory";
  ready(): boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Returns how many keys were deleted. */
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  /** Keys matching a glob with a trailing `*` (e.g. `rt:123:*`). */
  keys(prefixPattern: string): Promise<string[]>;
  close(): Promise<void>;
}

class RedisKV implements KV {
  readonly backend = "redis" as const;
  constructor(private client: Redis) {}
  ready() {
    return this.client.status === "ready";
  }
  get(key: string) {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) await this.client.set(key, value, "EX", ttlSeconds);
    else await this.client.set(key, value);
  }
  del(...keys: string[]) {
    return keys.length ? this.client.del(...keys) : Promise.resolve(0);
  }
  incr(key: string) {
    return this.client.incr(key);
  }
  async expire(key: string, ttlSeconds: number) {
    await this.client.expire(key, ttlSeconds);
  }
  async keys(pattern: string) {
    const found: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      found.push(...batch);
    } while (cursor !== "0");
    return found;
  }
  async close() {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

/** Development-only fallback. Data is lost on restart (you'll just need to sign in again). */
class MemoryKV implements KV {
  readonly backend = "memory" as const;
  private data = new Map<string, { value: string; expiresAt?: number }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry?.expiresAt && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }
  ready() {
    return true;
  }
  async get(key: string) {
    return this.live(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    this.data.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.live(k) && this.data.delete(k)) n++;
    return n;
  }
  async incr(key: string) {
    const entry = this.live(key);
    const value = String(Number(entry?.value ?? 0) + 1);
    this.data.set(key, { value, expiresAt: entry?.expiresAt });
    return Number(value);
  }
  async expire(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
  }
  async keys(pattern: string) {
    const prefix = pattern.replace(/\*$/, "");
    return [...this.data.keys()].filter((k) => k.startsWith(prefix) && this.live(k));
  }
  async close() {
    this.data.clear();
  }
}

/** Try Redis once, quickly, without ioredis' endless reconnect loop spamming the logs. */
async function tryRedis(url: string): Promise<Redis> {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 3000,
    // Fail commands fast instead of queueing them while disconnected
    // (that queue is what produced "MaxRetriesPerRequestError").
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 500, 5000), // keep reconnecting after a drop
  });
  let lastError = "";
  client.on("error", (err) => {
    // Log each distinct error once, not every retry.
    if (err.message !== lastError) console.error("Redis error:", err.message);
    lastError = err.message;
  });
  client.on("ready", () => (lastError = ""));
  try {
    await client.connect();
    return client;
  } catch (err) {
    client.disconnect();
    throw err;
  }
}

// Replaced by connectRedis() at startup; memory is a safe default for scripts/tests.
export let kv: KV = new MemoryKV();

export async function connectRedis() {
  if (!env.REDIS_URL) {
    if (isProd) throw new Error("REDIS_URL is required in production");
    console.warn("⚠️  REDIS_URL not set — using in-memory store (development only).");
    return;
  }
  try {
    kv = new RedisKV(await tryRedis(env.REDIS_URL));
    console.log("✅ Redis connected");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (isProd) throw new Error(`Redis unavailable (${reason})`);
    console.warn(
      `⚠️  Redis unavailable at ${env.REDIS_URL} (${reason}).\n` +
        "   Using an in-memory store instead — fine for development, but sessions reset when the server restarts.\n" +
        "   See README → 'Redis on Windows' to run the real thing.",
    );
  }
}
