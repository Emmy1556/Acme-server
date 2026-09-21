import type { RequestHandler } from "express";
import { ApiError } from "../utils/ApiError";
import { tokensValidAfter, verifyAccessToken } from "../utils/tokens";
import type { Role } from "../models/User";

function readToken(header?: string) {
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** Requires a valid access token that hasn't been revoked (deactivation, role or password change). */
export const protect: RequestHandler = async (req, _res, next) => {
  const token = readToken(req.headers.authorization);
  if (!token) throw ApiError.unauthorized();
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized("Session expired, please sign in again");
  }
  if ((payload.iat ?? 0) < (await tokensValidAfter(payload.sub))) {
    throw ApiError.unauthorized("Session expired, please sign in again");
  }
  req.user = { id: payload.sub, role: payload.role };
  next();
};

/** Attaches req.user when a valid token is present, but never blocks. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = readToken(req.headers.authorization);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      /* ignore */
    }
  }
  next();
};

/** Restricts a route to the given roles. Use after `protect`. */
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };
