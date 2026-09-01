import { getRolePermissions } from "../config/permissions.js";
import type { AdminRecord, AdminView, AuthUser, PublicUser, UserRecord } from "../types/auth.js";

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    organizationId: user.organizationId,
    permissions: getRolePermissions(user.role),
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    ...toAuthUser(user),
    phone: user.phone,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toAdminView(user: AdminRecord): AdminView {
  return {
    ...toPublicUser(user),
    organization: user.organization
      ? {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          isActive: user.organization.isActive,
        }
      : null,
  };
}
