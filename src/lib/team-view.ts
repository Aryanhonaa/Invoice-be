import type { OrganizationRecord, TeamRecord, TeamView } from "../types/auth.js";

export function toTeamView(
  team: TeamRecord,
  memberCount: number,
  organization: OrganizationRecord | null = null,
): TeamView {
  return {
    id: team.id,
    organizationId: team.organizationId,
    name: team.name,
    description: team.description,
    isActive: team.isActive,
    memberCount,
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          isActive: organization.isActive,
        }
      : null,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
  };
}
