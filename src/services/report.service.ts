import { resolveDateRange, type DatePreset } from "../lib/date-range.js";
import { getSoleOrganizationId, listOrganizations } from "../repositories/organization.repository.js";
import { loadReport } from "../repositories/report.repository.js";
import { listTeamsForUser } from "../repositories/team.repository.js";
import type { AuthUser } from "../types/auth.js";
import type { ReportKind, ReportView } from "../types/report.js";
import { scopedOrganizationFilter } from "../utils/organization-scope.js";
import { resolveTeamScope } from "../utils/team-scope.js";

export async function getReport(
  actor: AuthUser,
  query: {
    kind: ReportKind;
    preset: DatePreset;
    dateFrom?: string;
    dateTo?: string;
    organizationId?: string;
    teamId?: string;
    page: number;
    pageSize: number;
    csv?: boolean;
  },
): Promise<ReportView> {
  const organizationId =
    actor.role === "SUPER_ADMIN"
      ? (query.organizationId ?? (await getSoleOrganizationId()) ?? undefined)
      : scopedOrganizationFilter(actor, query.organizationId);
  const { teamId } =
    actor.role === "SUPER_ADMIN"
      ? { teamId: null }
      : await resolveTeamScope(actor, {
          organizationId,
          teamId: query.teamId,
        });
  const range = resolveDateRange(query.preset, query.dateFrom, query.dateTo);
  const teams = actor.role === "MEMBER" ? await listTeamsForUser(actor.id) : [];

  const loaded = await loadReport({
    kind: query.kind,
    preset: query.preset,
    range,
    scope: {
      organizationId,
      assignedTeamId: teamId ?? undefined,
      createdById: actor.role === "MEMBER" && !teamId ? actor.id : undefined,
      assignedMemberId: actor.role === "MEMBER" && !teamId ? actor.id : undefined,
      assignedTeamIds: actor.role === "MEMBER" && !teamId ? teams.map((team) => team.id) : undefined,
      expenseCreatedById: actor.role === "MEMBER" ? actor.id : undefined,
    },
    page: query.page,
    pageSize: query.pageSize,
    csv: query.csv,
  });

  const organizations =
    actor.role === "SUPER_ADMIN"
      ? (await listOrganizations()).map((organization) => ({
          id: organization.id,
          name: organization.name,
        }))
      : [];

  const isSystem = actor.role === "SUPER_ADMIN";

  return {
    ...loaded,
    role: actor.role,
    scope: actor.role === "MEMBER" ? "MEMBER" : isSystem ? "SYSTEM" : "ORGANIZATION",
    organizationId: organizationId ?? null,
    teamId,
    organizations,
    overview: loaded.overview,
    series: loaded.series,
    breakdown: loaded.breakdown,
    table: loaded.table,
  };
}
