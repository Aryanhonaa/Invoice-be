import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { toMemberView } from "../lib/member-view.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import {
  addTeamMember,
  findTeamById,
  isTeamMember,
  listTeamMembers,
  removeTeamMember,
} from "../repositories/team.repository.js";
import { findMemberById } from "../repositories/user.repository.js";
import type { AuthUser, MemberView } from "../types/auth.js";
import { recordAudit } from "./audit.service.js";

function canManageMemberships(actor: AuthUser): boolean {
  return actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
}

function assertTeamOrganizationAccess(actor: AuthUser, organizationId: string): void {
  if (actor.role !== "SUPER_ADMIN" && actor.organizationId !== organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }
}

export async function listTeamMemberAccounts(
  actor: AuthUser,
  teamId: string,
): Promise<MemberView[]> {
  const team = await findTeamById(teamId);
  if (!team) {
    throw new NotFoundError("Team not found");
  }

  assertTeamOrganizationAccess(actor, team.organizationId);

  const [members, organization] = await Promise.all([
    listTeamMembers(team.id),
    findOrganizationById(team.organizationId),
  ]);

  return members
    .filter((member) => member.role === "MEMBER")
    .map((member) => toMemberView(member, organization, [team]));
}

export async function addMemberToTeam(
  actor: AuthUser,
  teamId: string,
  memberId: string,
): Promise<MemberView> {
  if (!canManageMemberships(actor)) {
    throw new ForbiddenError("You cannot assign members to teams");
  }

  const team = await findTeamById(teamId);
  if (!team) {
    throw new NotFoundError("Team not found");
  }

  assertTeamOrganizationAccess(actor, team.organizationId);

  if (!team.isActive) {
    throw new ForbiddenError("You cannot assign a member to an inactive team");
  }

  const member = await findMemberById(memberId);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  if (member.organizationId !== team.organizationId) {
    throw new ForbiddenError("Member must belong to the same organization as the team");
  }

  if (member.status !== "ACTIVE") {
    throw new ForbiddenError("You cannot assign an inactive member to a team");
  }

  if (await isTeamMember(team.id, member.id)) {
    throw new ConflictError("Member is already assigned to this team");
  }

  await addTeamMember(team.id, member.id);

  await recordAudit({
    actorId: actor.id,
    action: "MEMBER_ADDED_TO_TEAM",
    entity: "TeamMember",
    entityId: member.id,
    organizationId: team.organizationId,
    metadata: { teamId: team.id, memberId: member.id },
  });

  const updated = await findMemberById(member.id);
  if (!updated) {
    throw new NotFoundError("Member not found");
  }

  return toMemberView(
    updated,
    updated.organization,
    updated.teamMemberships.map((membership) => membership.team),
  );
}

export async function removeMemberFromTeam(
  actor: AuthUser,
  teamId: string,
  memberId: string,
): Promise<void> {
  if (!canManageMemberships(actor)) {
    throw new ForbiddenError("You cannot remove members from teams");
  }

  const team = await findTeamById(teamId);
  if (!team) {
    throw new NotFoundError("Team not found");
  }

  assertTeamOrganizationAccess(actor, team.organizationId);

  const member = await findMemberById(memberId);
  if (!member || member.organizationId !== team.organizationId) {
    throw new NotFoundError("Member not found");
  }

  if (!(await isTeamMember(team.id, member.id))) {
    throw new NotFoundError("Team membership not found");
  }

  await removeTeamMember(team.id, member.id);

  await recordAudit({
    actorId: actor.id,
    action: "MEMBER_REMOVED_FROM_TEAM",
    entity: "TeamMember",
    entityId: member.id,
    organizationId: team.organizationId,
    metadata: { teamId: team.id, memberId: member.id },
  });
}
