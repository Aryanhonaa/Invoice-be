import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { findTeamById, isTeamMember } from "../repositories/team.repository.js";
import type { AuthUser } from "../types/auth.js";

export async function resolveTeamScope(
  actor: AuthUser,
  input: { organizationId?: string; teamId?: string },
): Promise<{ teamId: string | null }> {
  if (!input.teamId) {
    return { teamId: null };
  }

  const team = await findTeamById(input.teamId);
  if (!team) {
    throw new NotFoundError("Team not found");
  }

  if (actor.role === "SUPER_ADMIN") {
    if (!input.organizationId) {
      throw new ValidationError("organizationId is required when filtering by team");
    }
    if (team.organizationId !== input.organizationId) {
      throw new ForbiddenError("You do not have access to this team");
    }
    return { teamId: team.id };
  }

  if (!actor.organizationId || team.organizationId !== actor.organizationId) {
    throw new ForbiddenError("You do not have access to this team");
  }

  if (actor.role === "MEMBER" && !(await isTeamMember(team.id, actor.id))) {
    throw new ForbiddenError("You do not have access to this team");
  }

  return { teamId: team.id };
}
