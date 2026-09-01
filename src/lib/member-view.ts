import { toPublicUser } from "./public-user.js";
import type { MemberView, OrganizationRecord, TeamRecord, UserRecord } from "../types/auth.js";

export function toMemberView(
  user: UserRecord,
  organization: OrganizationRecord | null,
  teams: Pick<TeamRecord, "id" | "name" | "isActive">[],
): MemberView {
  return {
    ...toPublicUser(user),
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          isActive: organization.isActive,
        }
      : null,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      isActive: team.isActive,
    })),
  };
}
