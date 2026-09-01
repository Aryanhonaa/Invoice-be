import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { toTeamView } from "../lib/team-view.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import {
  countTeamMembers,
  createTeam,
  findTeamById,
  findTeamByOrganizationAndName,
  isTeamMember,
  listTeams,
  updateTeam,
} from "../repositories/team.repository.js";
import type { AuthUser, TeamView } from "../types/auth.js";
import {
  resolveManagedOrganizationId,
  scopedOrganizationFilter,
} from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

function canManageTeams(actor: AuthUser): boolean {
  return actor.role === "SUPER_ADMIN";
}

export async function listTeamAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: "ACTIVE" | "INACTIVE";
    organizationId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: TeamView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const organizationId = scopedOrganizationFilter(actor, query.organizationId);
  const { items, total } = await listTeams({
    search: query.search,
    isActive: query.status === undefined ? undefined : query.status === "ACTIVE",
    organizationId,
    memberUserId: actor.role === "MEMBER" ? actor.id : undefined,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    items: items.map((team) => toTeamView(team, team._count.members, team.organization)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getTeamAccount(actor: AuthUser, id: string): Promise<TeamView> {
  const team = await findTeamById(id);
  if (!team) {
    throw new NotFoundError("Team not found");
  }

  if (actor.role !== "SUPER_ADMIN" && actor.organizationId !== team.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  if (actor.role === "MEMBER" && !(await isTeamMember(team.id, actor.id))) {
    throw new ForbiddenError("You do not have access to this team");
  }

  const [memberCount, organization] = await Promise.all([
    countTeamMembers(team.id),
    findOrganizationById(team.organizationId),
  ]);

  return toTeamView(team, memberCount, organization);
}

export async function createTeamAccount(
  actor: AuthUser,
  input: { name: string; description?: string; organizationId?: string },
): Promise<TeamView> {
  if (!canManageTeams(actor)) {
    throw new ForbiddenError("You cannot create teams");
  }

  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  const duplicate = await findTeamByOrganizationAndName(organizationId, input.name);
  if (duplicate) {
    throw new ConflictError("A team with this name already exists in the organization");
  }

  const team = await createTeam({
    organizationId,
    name: input.name,
    description: input.description,
  });

  await recordAudit({
    actorId: actor.id,
    action: "TEAM_CREATED",
    entity: "Team",
    entityId: team.id,
    organizationId,
    metadata: { name: team.name },
  });

  return toTeamView(team, 0, organization);
}

export async function updateTeamAccount(
  actor: AuthUser,
  id: string,
  input: { name?: string; description?: string | null },
): Promise<TeamView> {
  if (!canManageTeams(actor)) {
    throw new ForbiddenError("You cannot update teams");
  }

  const team = await findTeamById(id);
  if (!team) {
    throw new NotFoundError("Team not found");
  }

  if (actor.role !== "SUPER_ADMIN" && actor.organizationId !== team.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  if (input.name && input.name !== team.name) {
    const duplicate = await findTeamByOrganizationAndName(team.organizationId, input.name);
    if (duplicate) {
      throw new ConflictError("A team with this name already exists in the organization");
    }
  }

  const updated = await updateTeam(team.id, {
    name: input.name,
    description: input.description === undefined ? undefined : input.description,
  });

  await recordAudit({
    actorId: actor.id,
    action: "TEAM_UPDATED",
    entity: "Team",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { name: updated.name },
  });

  const [memberCount, organization] = await Promise.all([
    countTeamMembers(updated.id),
    findOrganizationById(updated.organizationId),
  ]);

  return toTeamView(updated, memberCount, organization);
}

export async function updateTeamStatus(
  actor: AuthUser,
  id: string,
  status: "ACTIVE" | "INACTIVE",
): Promise<TeamView> {
  if (!canManageTeams(actor)) {
    throw new ForbiddenError("You cannot update teams");
  }

  const team = await findTeamById(id);
  if (!team) {
    throw new NotFoundError("Team not found");
  }

  if (actor.role !== "SUPER_ADMIN" && actor.organizationId !== team.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  const updated = await updateTeam(team.id, { isActive: status === "ACTIVE" });

  await recordAudit({
    actorId: actor.id,
    action: status === "ACTIVE" ? "TEAM_UPDATED" : "TEAM_DEACTIVATED",
    entity: "Team",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { name: updated.name, status },
  });

  const [memberCount, organization] = await Promise.all([
    countTeamMembers(updated.id),
    findOrganizationById(updated.organizationId),
  ]);

  return toTeamView(updated, memberCount, organization);
}
