import type { Request, Response } from "express";
import { User, type UserDoc } from "../../models/User";
import { ApiError } from "../../utils/ApiError";
import {
  REFRESH_COOKIE,
  clearCookieOptions,
  consumeRefreshToken,
  issueRefreshToken,
  refreshCookieOptions,
  revokeAllSessions,
  revokeRefreshToken,
  signAccessToken,
} from "../../utils/tokens";

async function sendSession(res: Response, user: UserDoc, status = 200) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  res.status(status).json({ success: true, data: { user, accessToken } });
}

export async function register(req: Request, res: Response) {
  const body = res.locals.body;
  if (await User.exists({ email: body.email })) throw ApiError.conflict("An account with this email already exists");
  const user = (await User.create(body)) as UserDoc;
  await sendSession(res, user, 201);
}

export async function login(_req: Request, res: Response) {
  const { email, password } = res.locals.body;
  const user = (await User.findOne({ email }).select("+password")) as UserDoc | null;
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized("Invalid email or password");
  if (!user.isActive) throw ApiError.forbidden("This account has been deactivated");
  await sendSession(res, user);
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized();
  let userId: string | null = null;
  try {
    userId = await consumeRefreshToken(token);
  } catch {
    /* invalid signature / expired */
  }
  if (!userId) {
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions());
    throw ApiError.unauthorized("Session expired, please sign in again");
  }
  const user = (await User.findById(userId)) as UserDoc | null;
  if (!user || !user.isActive) throw ApiError.unauthorized();
  await sendSession(res, user); // rotates the refresh token
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions());
  res.json({ success: true, message: "Logged out" });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound("User not found");
  res.json({ success: true, data: user });
}

export async function updateProfile(req: Request, res: Response) {
  const user = await User.findByIdAndUpdate(req.user!.id, res.locals.body, { returnDocument: "after", runValidators: true });
  res.json({ success: true, data: user });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = res.locals.body;
  const user = (await User.findById(req.user!.id).select("+password")) as UserDoc | null;
  if (!user || !(await user.comparePassword(currentPassword))) throw ApiError.badRequest("Current password is incorrect");
  user.password = newPassword;
  await user.save();
  // Sign out every other device, then hand this one a fresh session.
  await revokeAllSessions(user.id);
  await sendSession(res, user);
}
