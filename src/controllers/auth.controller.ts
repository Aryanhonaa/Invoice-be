import type { Request, Response } from "express";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../lib/cookies.js";
import { UnauthorizedError } from "../lib/errors.js";
import { getAuthenticatedUser, login, logout } from "../services/auth.service.js";
import { success } from "../utils/api-response.js";
import { validate } from "../validators/validate.js";
import { loginSchema } from "../validators/auth.validators.js";

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const body = validate(loginSchema, req.body);
  const result = await login({
    ...body,
    ...requestMeta(req),
  });

  setSessionCookie(res, result.token);
  res.status(200).json(success({ user: result.user }));
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }

  await logout({
    token: readSessionToken(req),
    actorId: req.authUser.id,
    organizationId: req.authUser.organizationId,
    ...requestMeta(req),
  });

  clearSessionCookie(res);
  res.status(200).json(success({ loggedOut: true }));
}

export async function meController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }

  const user = await getAuthenticatedUser(req.authUser.id);
  res.status(200).json(success({ user }));
}
