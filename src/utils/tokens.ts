import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";
import { redis } from "../config/redis";
import type { Role } from "../models/User";

export interface AccessPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload & jwt.JwtPayload;
}

/**
 * Refresh tokens are opaque JWTs with a unique id (jti) that is stored in Redis.
 * Logging out (or rotating) deletes the jti, which revokes the token immediately.
 */
const refreshKey = (userId: string, jti: string) => `rt:${userId}:${jti}`;
const refreshTtl = () => env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60;

export async function issueRefreshToken(userId: string) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: refreshTtl(),
  });
  await redis.set(refreshKey(userId, jti), "1", "EX", refreshTtl());
  return token;
}

export async function consumeRefreshToken(token: string) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload & { sub: string; jti: string };
  const deleted = await redis.del(refreshKey(payload.sub, payload.jti));
  if (!deleted) return null; // already used or revoked
  return payload.sub;
}

export async function revokeRefreshToken(token: string) {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload & { sub: string; jti: string };
    await redis.del(refreshKey(payload.sub, payload.jti));
  } catch {
    /* already invalid */
  }
}

/** Revoke every refresh token for a user (logout everywhere / deactivation / role change). */
export async function revokeAllSessions(userId: string) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `rt:${userId}:*`, "COUNT", 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
  // Access tokens issued before now are rejected by `protect` (they'd otherwise live up to 15 min).
  await redis.set(`tv:${userId}`, Math.floor(Date.now() / 1000).toString(), "EX", 24 * 60 * 60);
}

/** Unix seconds before which this user's access tokens are no longer valid, if any. */
export async function tokensValidAfter(userId: string) {
  try {
    const v = await redis.get(`tv:${userId}`);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

export const REFRESH_COOKIE = "acme_rt";

const baseCookie = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production" || env.COOKIE_SAMESITE === "none",
  sameSite: env.COOKIE_SAMESITE,
  path: "/api/auth",
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const refreshCookieOptions = () => ({ ...baseCookie(), maxAge: refreshTtl() * 1000 });
/** Must match the options used to set the cookie, or browsers won't clear it. */
export const clearCookieOptions = () => baseCookie();
