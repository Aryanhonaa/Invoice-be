import { ForbiddenError, ValidationError } from "../lib/errors.js";
import { getSoleOrganizationId } from "../repositories/organization.repository.js";
import type { AuthUser } from "../types/auth.js";

export async function resolveManagedOrganizationId(
  actor: AuthUser,
  requested?: string,
): Promise<string> {
  if (actor.role === "SUPER_ADMIN") {
    if (requested) {
      return requested;
    }
    const sole = await getSoleOrganizationId();
    if (sole) {
      return sole;
    }
    throw new ValidationError("organizationId is required");
  }

  if (actor.organizationId) {
    if (requested && requested !== actor.organizationId) {
      throw new ForbiddenError("You do not have access to this organization");
    }
    return actor.organizationId;
  }

  throw new ForbiddenError("You do not have access to this organization");
}

export function assertOrganizationAccess(
  actor: AuthUser,
  organizationId: string | null,
): void {
  if (actor.role === "SUPER_ADMIN") {
    return;
  }

  if (!organizationId || actor.organizationId !== organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }
}

export function scopedOrganizationFilter(
  actor: AuthUser,
  requested?: string,
): string | undefined {
  if (actor.role === "SUPER_ADMIN") {
    return requested;
  }

  if (requested && actor.organizationId && requested !== actor.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  return actor.organizationId ?? undefined;
}

export async function scopedTenantOrganizationId(
  actor: AuthUser,
  requested?: string,
): Promise<string | undefined> {
  if (actor.role === "SUPER_ADMIN") {
    if (requested) {
      return requested;
    }
    const sole = await getSoleOrganizationId();
    if (sole) {
      return sole;
    }
    throw new ValidationError("organizationId is required");
  }

  return scopedOrganizationFilter(actor, requested);
}
