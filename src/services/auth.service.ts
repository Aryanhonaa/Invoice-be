import { getSessionExpiry } from "../config/auth.js";
import { AccountInactiveError, ConflictError, UnauthorizedError } from "../lib/errors.js";
import { hashPassword, verifyPasswordTimingSafe } from "../lib/password.js";
import { toPublicUser } from "../lib/public-user.js";
import { createSessionToken, hashSessionToken } from "../lib/session-token.js";
import {
  createSession,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
} from "../repositories/session.repository.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import {
  countUsersByRole,
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
} from "../repositories/user.repository.js";
import type { PublicUser, UserRecord } from "../types/auth.js";
import { recordAudit } from "./audit.service.js";

const GENERIC_LOGIN_FAILURE = "Invalid email or password";

async function assertActiveOrganization(organizationId: string | null): Promise<void> {
  if (!organizationId) {
    return;
  }
  const organization = await findOrganizationById(organizationId);
  if (!organization || !organization.isActive) {
    throw new AccountInactiveError("This organization is inactive");
  }
}

export async function login(input: {
  email: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{ user: PublicUser; token: string }> {
  const user = await findUserByEmail(input.email);
  const passwordValid = await verifyPasswordTimingSafe(input.password, user?.passwordHash ?? null);

  if (!user || !passwordValid) {
    if (user) {
      await recordAudit({
        actorId: user.id,
        action: "AUTH_LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        organizationId: user.organizationId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    }
    throw new UnauthorizedError(GENERIC_LOGIN_FAILURE);
  }

  if (user.status !== "ACTIVE") {
    throw new AccountInactiveError();
  }

  await assertActiveOrganization(user.organizationId);

  const token = createSessionToken();
  await createSession({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: getSessionExpiry(),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  const updated = await updateUser(user.id, { lastLoginAt: new Date() });

  await recordAudit({
    actorId: user.id,
    action: "AUTH_LOGIN",
    entity: "User",
    entityId: user.id,
    organizationId: user.organizationId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return { user: toPublicUser(updated), token };
}

export async function logout(input: {
  token: string | undefined;
  actorId: string;
  organizationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  if (input.token) {
    await deleteSessionByTokenHash(hashSessionToken(input.token));
  }

  await recordAudit({
    actorId: input.actorId,
    action: "AUTH_LOGOUT",
    entity: "User",
    entityId: input.actorId,
    organizationId: input.organizationId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export async function getAuthenticatedUser(userId: string): Promise<PublicUser> {
  const user = await findUserById(userId);

  if (!user || user.status !== "ACTIVE") {
    throw new UnauthorizedError("Authentication required");
  }

  await assertActiveOrganization(user.organizationId);

  return toPublicUser(user);
}

export async function resolveSessionUser(token: string | undefined): Promise<UserRecord> {
  if (!token) {
    throw new UnauthorizedError();
  }

  const session = await findSessionByTokenHash(hashSessionToken(token));

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await deleteSessionByTokenHash(session.tokenHash);
    }
    throw new UnauthorizedError();
  }

  const user = await findUserById(session.userId);

  if (!user || user.status !== "ACTIVE") {
    throw new UnauthorizedError();
  }

  await assertActiveOrganization(user.organizationId);

  return user;
}

export async function bootstrapSuperAdmin(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<UserRecord> {
  const existing = await countUsersByRole("SUPER_ADMIN");

  if (existing > 0) {
    throw new ConflictError("A SUPER_ADMIN account already exists");
  }

  const duplicate = await findUserByEmail(input.email);
  if (duplicate) {
    throw new ConflictError("A user with this email already exists");
  }

  return createUser({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    firstName: input.firstName,
    lastName: input.lastName,
    role: "SUPER_ADMIN",
    organizationId: null,
  });
}
