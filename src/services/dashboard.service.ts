import { Permissions } from "../config/permissions.js";
import { resolveDateRange, type DatePreset } from "../lib/date-range.js";
import { loadDashboardSnapshot } from "../repositories/dashboard.repository.js";
import { getSoleOrganizationId, listOrganizations } from "../repositories/organization.repository.js";
import { listTeamsForUser } from "../repositories/team.repository.js";
import type { AuthUser } from "../types/auth.js";
import type { DashboardView } from "../types/dashboard.js";
import { scopedOrganizationFilter } from "../utils/organization-scope.js";
import { resolveTeamScope } from "../utils/team-scope.js";

export async function getDashboard(
  actor: AuthUser,
  query: {
    organizationId?: string;
    teamId?: string;
    preset?: DatePreset;
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<DashboardView> {
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
  const range = resolveDateRange(query.preset ?? "this_year", query.dateFrom, query.dateTo);
  const memberTeams = actor.role === "MEMBER" ? await listTeamsForUser(actor.id) : [];
  const invoiceAccess =
    actor.role === "MEMBER" && !teamId
      ? {
          createdById: actor.id,
          assignedMemberId: actor.id,
          assignedTeamIds: memberTeams.map((team) => team.id),
        }
      : undefined;

  const snapshot = await loadDashboardSnapshot({
    organizationId,
    assignedTeamId: teamId ?? undefined,
    invoiceAccess,
    range,
  });

  const isSuperAdmin = actor.role === "SUPER_ADMIN";
  const isMember = actor.role === "MEMBER";
  const isSystem = isSuperAdmin && !organizationId;
  const canViewExpenses = actor.permissions.includes(Permissions.EXPENSES_VIEW);
  const canViewTeams = !isMember && actor.permissions.includes(Permissions.TEAMS_VIEW);

  const platformOrganizations = isSystem ? await listOrganizations() : [];
  const activeOrganizations = isSystem
    ? platformOrganizations.filter((organization) => organization.isActive).length
    : null;
  const inactiveOrganizations = isSystem
    ? platformOrganizations.filter((organization) => !organization.isActive).length
    : null;

  return {
    role: actor.role,
    scope: isMember ? "MEMBER" : isSystem ? "SYSTEM" : "ORGANIZATION",
    organizationId: organizationId ?? null,
    teamId,
    currency: snapshot.currency,
    granularity: snapshot.granularity,
    range: {
      preset: query.preset ?? "this_year",
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    metrics: {
      organizations: isMember ? null : snapshot.organizationCount,
      activeOrganizations,
      inactiveOrganizations,
      admins: isSuperAdmin ? snapshot.adminCount : null,
      members: isMember ? null : snapshot.memberCount,
      teams: isMember ? null : snapshot.teamCount,
      customers: snapshot.customerCount,
      invoices: snapshot.invoiceCount,
      paidInvoices: snapshot.paidInvoiceCount,
      unpaidInvoices: snapshot.unpaidInvoiceCount,
      overdueInvoices: snapshot.overdueInvoiceCount,
      partiallyPaidInvoices: snapshot.partiallyPaidInvoiceCount,
      expenses: snapshot.expenseTotal,
      revenue: snapshot.revenue,
      paidAmount: snapshot.paidAmount,
      outstandingBalance: snapshot.outstandingBalance,
      overdueAmount: snapshot.overdueAmount,
    },
    invoiceStatusSeries: snapshot.statusCounts,
    revenueSeries: snapshot.revenueSeries,
    paymentSeries: snapshot.paymentSeries,
    expenseSeries: canViewExpenses ? snapshot.expenseSeries : [],
    teamPerformance: canViewTeams ? snapshot.teamPerformance : [],
    topCustomers: snapshot.topCustomers,
    organizationActivity: isSystem ? snapshot.organizationActivity : [],
    recentInvoices: snapshot.recentInvoices,
    recentPayments: snapshot.recentPayments,
    overdueInvoices: snapshot.overdueInvoices,
    organizations: isSuperAdmin ? snapshot.organizations : [],
  };
}
