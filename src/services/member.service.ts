import type { AccountStatus } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { toMemberView } from "../lib/member-view.js";
import { hashPassword } from "../lib/password.js";
import { createInvitationToken, generateTemporaryPassword } from "../lib/temporary-credentials.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import { deleteSessionsByUserId } from "../repositories/session.repository.js";
import { addTeamMember, findTeamById, listTeamsForUser } from "../repositories/team.repository.js";
import {
  createUser,
  findMemberById,
  findUserByEmail,
  listMembers,
  updateUser,
} from "../repositories/user.repository.js";
import type { AuthUser, MemberView } from "../types/auth.js";
import {
  resolveManagedOrganizationId,
  scopedOrganizationFilter,
} from "../utils/organization-scope.js";
import { resolveTeamScope } from "../utils/team-scope.js";
import { recordAudit } from "./audit.service.js";

function canManageMembers(actor: AuthUser): boolean {
  return actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
}

export async function listMemberAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: AccountStatus;
    organizationId?: string;
    teamId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: MemberView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  if (!canManageMembers(actor)) {
    throw new ForbiddenError("You cannot view members");
  }

  const organizationId = scopedOrganizationFilter(actor, query.organizationId);
  let requestedTeamId = query.teamId;
  if (!requestedTeamId && actor.role === "ADMIN") {
    const actorTeams = await listTeamsForUser(actor.id);
    if (actorTeams.length === 1) {
      requestedTeamId = actorTeams[0].id;
    }
  }
  const { teamId } = await resolveTeamScope(actor, {
    organizationId,
    teamId: requestedTeamId,
  });

  const { items, total } = await listMembers({
    ...query,
    organizationId,
    teamId: teamId ?? undefined,
  });

  return {
    items: items.map((member) =>
      toMemberView(
        member,
        member.organization,
        member.teamMemberships.map((membership) => membership.team),
      ),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getMemberAccount(actor: AuthUser, id: string): Promise<MemberView> {
  if (!canManageMembers(actor)) {
    throw new ForbiddenError("You cannot view members");
  }

  const member = await findMemberById(id);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  if (actor.role === "ADMIN" && member.organizationId !== actor.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  return toMemberView(
    member,
    member.organization,
    member.teamMemberships.map((membership) => membership.team),
  );
}

export async function createMember(
  actor: AuthUser,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    organizationId?: string;
    teamIds?: string[];
    temporaryPassword?: string;
    password?: string;
    status?: AccountStatus;
    role?: unknown;
  },
): Promise<{ user: MemberView; temporaryPassword: string | null; invitationToken: string }> {
  if (input.role !== undefined) {
    throw new ForbiddenError("Role cannot be assigned through this endpoint");
  }

  if (!canManageMembers(actor)) {
    throw new ForbiddenError("You cannot create members");
  }

  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  const email = input.email.toLowerCase();
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  const providedPassword = input.temporaryPassword ?? input.password;
  const generatedPassword = providedPassword ? null : generateTemporaryPassword();
  const passwordToHash = providedPassword ?? generatedPassword;
  if (!passwordToHash) {
    throw new ConflictError("A temporary password is required");
  }

  const invitation = createInvitationToken();

  const created = await createUser({
    email,
    passwordHash: await hashPassword(passwordToHash),
    firstName: input.firstName,
    lastName: input.lastName,
    phone: null,
    role: "MEMBER",
    status: input.status ?? "ACTIVE",
    organizationId,
    passwordResetToken: invitation.tokenHash,
    passwordResetExpires: invitation.expiresAt,
  });

  let teamIds = input.teamIds ?? [];
  if (teamIds.length === 0 && actor.role === "ADMIN") {
    const actorTeams = await listTeamsForUser(actor.id);
    teamIds = actorTeams.filter((team) => team.isActive).map((team) => team.id);
  }

  for (const teamId of teamIds) {
    const team = await findTeamById(teamId);
    if (!team || team.organizationId !== organizationId) {
      throw new ForbiddenError("You cannot assign a member to an unauthorized team");
    }
    if (!team.isActive) {
      throw new ForbiddenError("You cannot assign a member to an inactive team");
    }
    await addTeamMember(team.id, created.id);
    await recordAudit({
      actorId: actor.id,
      action: "MEMBER_ADDED_TO_TEAM",
      entity: "TeamMember",
      entityId: created.id,
      organizationId,
      metadata: { teamId: team.id, memberId: created.id },
    });
  }

  await recordAudit({
    actorId: actor.id,
    action: "MEMBER_CREATED",
    entity: "User",
    entityId: created.id,
    organizationId,
    metadata: { email: created.email },
  });

  const member = await findMemberById(created.id);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  return {
    user: toMemberView(
      member,
      member.organization,
      member.teamMemberships.map((membership) => membership.team),
    ),
    temporaryPassword: generatedPassword,
    invitationToken: invitation.token,
  };
}

export async function updateMember(
  actor: AuthUser,
  memberId: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    role?: unknown;
  },
): Promise<MemberView> {
  if (input.role !== undefined) {
    throw new ForbiddenError("Role cannot be changed through this endpoint");
  }

  if (!canManageMembers(actor)) {
    throw new ForbiddenError("You cannot update members");
  }

  const member = await findMemberById(memberId);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  if (actor.role === "ADMIN" && member.organizationId !== actor.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  if (input.email) {
    const email = input.email.toLowerCase();
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== member.id) {
      throw new ConflictError("A user with this email already exists");
    }
  }

  await updateUser(member.id, {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
  });

  const updated = await findMemberById(member.id);
  if (!updated) {
    throw new NotFoundError("Member not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: "MEMBER_UPDATED",
    entity: "User",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { email: updated.email },
  });

  return toMemberView(
    updated,
    updated.organization,
    updated.teamMemberships.map((membership) => membership.team),
  );
}

export async function updateMemberStatus(
  actor: AuthUser,
  memberId: string,
  status: AccountStatus,
): Promise<MemberView> {
  if (!canManageMembers(actor)) {
    throw new ForbiddenError("You cannot update members");
  }

  const member = await findMemberById(memberId);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  if (actor.role === "ADMIN" && member.organizationId !== actor.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  await updateUser(member.id, { status });

  if (status === "INACTIVE") {
    await deleteSessionsByUserId(member.id);
  }

  const updated = await findMemberById(member.id);
  if (!updated) {
    throw new NotFoundError("Member not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: status === "ACTIVE" ? "MEMBER_UPDATED" : "MEMBER_DEACTIVATED",
    entity: "User",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { email: updated.email, status },
  });

  return toMemberView(
    updated,
    updated.organization,
    updated.teamMemberships.map((membership) => membership.team),
  );
}
