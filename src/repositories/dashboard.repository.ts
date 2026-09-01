import type { InvoiceStatus, Prisma } from "@prisma/client";
import {
  periodKey,
  periodKeys,
  rangeDayCount,
  startOfUtcDay,
  type DateRange,
} from "../lib/date-range.js";
import { deriveInvoiceStatus, derivePaymentStatus } from "../lib/invoice-status.js";
import { money, moneyString } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import type {
  DashboardInvoiceSummary,
  DashboardOrganizationActivity,
  DashboardPaymentSummary,
  DashboardSeriesPoint,
  DashboardStatusCount,
  DashboardTeamPerformance,
  DashboardTopCustomer,
  DashboardGranularity,
} from "../types/dashboard.js";

export interface DashboardQueryScope {
  organizationId?: string;
  assignedTeamId?: string;
  invoiceAccess?: {
    createdById: string;
    assignedMemberId: string;
    assignedTeamIds: string[];
  };
  range: DateRange;
}

export interface DashboardSnapshot {
  organizationCount: number;
  adminCount: number;
  memberCount: number;
  teamCount: number;
  customerCount: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  partiallyPaidInvoiceCount: number;
  expenseTotal: string;
  revenue: string;
  paidAmount: string;
  outstandingBalance: string;
  overdueAmount: string;
  currency: string;
  granularity: DashboardGranularity;
  statusCounts: DashboardStatusCount[];
  revenueSeries: DashboardSeriesPoint[];
  paymentSeries: DashboardSeriesPoint[];
  expenseSeries: DashboardSeriesPoint[];
  teamPerformance: DashboardTeamPerformance[];
  topCustomers: DashboardTopCustomer[];
  organizationActivity: DashboardOrganizationActivity[];
  recentInvoices: DashboardInvoiceSummary[];
  recentPayments: DashboardPaymentSummary[];
  overdueInvoices: DashboardInvoiceSummary[];
  organizations: Array<{ id: string; name: string }>;
}

export async function loadDashboardSnapshot(
  scope: DashboardQueryScope,
  now = new Date(),
): Promise<DashboardSnapshot> {
  const invoiceWhere = buildInvoiceWhere(scope);
  const invoiceInRange: Prisma.InvoiceWhereInput = {
    ...invoiceWhere,
    invoiceDate: { gte: scope.range.start, lt: scope.range.end },
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    status: "COMPLETED",
    paidAt: { gte: scope.range.start, lt: scope.range.end },
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    ...(scope.invoiceAccess ? { invoice: invoiceWhere } : {}),
  };
  const expenseWhere: Prisma.ExpenseWhereInput = {
    incurredOn: { gte: scope.range.start, lt: scope.range.end },
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
  };
  const userWhere = scope.organizationId ? { organizationId: scope.organizationId } : {};
  const overdueWhere: Prisma.InvoiceWhereInput = {
    ...invoiceInRange,
    status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    dueDate: { lt: startOfUtcDay(now) },
  };
  const outstandingWhere: Prisma.InvoiceWhereInput = {
    ...invoiceInRange,
    status: { notIn: ["DRAFT", "CANCELLED"] },
  };
  const daily = rangeDayCount(scope.range) <= 31;
  const granularity: DashboardGranularity = daily ? "day" : "month";

  const [
    organizationCount,
    adminCount,
    memberCount,
    teamCount,
    customerCount,
    invoiceCount,
    paidInvoiceCount,
    unpaidInvoiceCount,
    overdueInvoiceCount,
    pendingInvoiceCount,
    partialInvoiceCount,
    cancelledInvoiceCount,
    revenueAgg,
    outstandingAgg,
    overdueAgg,
    currencySample,
    recentInvoiceRows,
    overdueInvoiceRows,
    recentPaymentRows,
    seriesPayments,
    seriesExpenses,
    customerGroups,
    teamGroups,
    organizationGroups,
    organizations,
  ] = await Promise.all([
    prisma.organization.count({
      where: scope.organizationId ? { id: scope.organizationId } : undefined,
    }),
    prisma.user.count({ where: { ...userWhere, role: "ADMIN" } }),
    prisma.user.count({ where: { ...userWhere, role: "MEMBER" } }),
    prisma.team.count({
      where: scope.organizationId ? { organizationId: scope.organizationId } : undefined,
    }),
    scope.invoiceAccess
      ? prisma.invoice
          .findMany({ where: invoiceInRange, select: { customerId: true }, distinct: ["customerId"] })
          .then((rows) => rows.length)
      : prisma.customer.count({
          where: scope.organizationId ? { organizationId: scope.organizationId } : undefined,
        }),
    prisma.invoice.count({ where: invoiceInRange }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "PAID" } }),
    prisma.invoice.count({
      where: { ...invoiceInRange, status: { notIn: ["PAID", "CANCELLED"] } },
    }),
    prisma.invoice.count({ where: overdueWhere }),
    prisma.invoice.count({
      where: {
        ...invoiceInRange,
        status: { in: ["SENT", "VIEWED"] },
        dueDate: { gte: startOfUtcDay(now) },
      },
    }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "PARTIALLY_PAID" } }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "CANCELLED" } }),
    prisma.payment.aggregate({
      where: paymentWhere,
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: outstandingWhere,
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.aggregate({
      where: overdueWhere,
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.findFirst({
      where: invoiceWhere,
      select: { currency: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: invoiceInRange,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: invoiceSummarySelect,
    }),
    prisma.invoice.findMany({
      where: overdueWhere,
      orderBy: { dueDate: "asc" },
      take: 5,
      select: invoiceSummarySelect,
    }),
    prisma.payment.findMany({
      where: paymentWhere,
      orderBy: { paidAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        currency: true,
        paidAt: true,
        invoiceId: true,
        invoice: {
          select: {
            invoiceNumber: true,
            organization: { select: { name: true } },
          },
        },
        customer: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: paymentWhere,
      select: { amount: true, paidAt: true, currency: true },
    }),
    prisma.expense.findMany({
      where: expenseWhere,
      select: { amount: true, incurredOn: true, currency: true },
    }),
    prisma.invoice.groupBy({
      by: ["customerId"],
      where: invoiceInRange,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
      orderBy: { _sum: { total: "desc" } },
      take: 8,
    }),
    prisma.invoice.groupBy({
      by: ["assignedTeamId"],
      where: invoiceInRange,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.groupBy({
      by: ["organizationId"],
      where: invoiceInRange,
      _count: { _all: true },
      _sum: { amountPaid: true },
      orderBy: { _sum: { amountPaid: "desc" } },
      take: 8,
    }),
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const currency = currencySample?.currency ?? "USD";
  const outstandingTotal = money(outstandingAgg._sum.total?.toString() ?? "0");
  const outstandingPaid = money(outstandingAgg._sum.amountPaid?.toString() ?? "0");
  const overdueTotal = money(overdueAgg._sum.total?.toString() ?? "0");
  const overduePaid = money(overdueAgg._sum.amountPaid?.toString() ?? "0");
  const collected = moneyString(revenueAgg._sum.amount?.toString() ?? "0");

  const customerIds = customerGroups.map((group) => group.customerId);
  const teamIds = teamGroups
    .map((group) => group.assignedTeamId)
    .filter((id): id is string => id !== null);
  const organizationIds = organizationGroups.map((group) => group.organizationId);

  const [customers, teams, activityOrgs] = await Promise.all([
    customerIds.length
      ? prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    teamIds.length
      ? prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    organizationIds.length
      ? prisma.organization.findMany({
          where: { id: { in: organizationIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const customerNames = new Map(customers.map((item) => [item.id, item.name]));
  const teamNames = new Map(teams.map((item) => [item.id, item.name]));
  const orgNames = new Map(activityOrgs.map((item) => [item.id, item.name]));

  const revenueSeries = buildMoneySeries(seriesPayments, scope.range, daily, currency, (row) => row.paidAt);
  const expenseSeries = buildMoneySeries(
    seriesExpenses,
    scope.range,
    daily,
    currency,
    (row) => row.incurredOn,
  );

  return {
    organizationCount,
    adminCount,
    memberCount,
    teamCount,
    customerCount,
    invoiceCount,
    paidInvoiceCount,
    unpaidInvoiceCount,
    overdueInvoiceCount,
    partiallyPaidInvoiceCount: partialInvoiceCount,
    expenseTotal: moneyString(
      seriesExpenses.reduce((sum, row) => sum.plus(row.amount.toString()), money(0)),
    ),
    revenue: collected,
    paidAmount: collected,
    outstandingBalance: moneyString(outstandingTotal.minus(outstandingPaid)),
    overdueAmount: moneyString(overdueTotal.minus(overduePaid)),
    currency,
    granularity,
    statusCounts: [
      { status: "PAID", count: paidInvoiceCount },
      { status: "PENDING", count: pendingInvoiceCount },
      { status: "PARTIALLY_PAID", count: partialInvoiceCount },
      { status: "OVERDUE", count: overdueInvoiceCount },
      { status: "CANCELLED", count: cancelledInvoiceCount },
    ],
    revenueSeries,
    paymentSeries: revenueSeries,
    expenseSeries,
    teamPerformance: teamGroups
      .map((group) => {
        const total = money(group._sum.total?.toString() ?? "0");
        const paid = money(group._sum.amountPaid?.toString() ?? "0");
        return {
          teamId: group.assignedTeamId,
          teamName: group.assignedTeamId ? (teamNames.get(group.assignedTeamId) ?? "Team") : "Unassigned",
          invoiceCount: group._count._all,
          revenue: moneyString(paid),
          outstanding: moneyString(total.minus(paid)),
        };
      })
      .sort((left, right) => money(right.revenue).comparedTo(money(left.revenue))),
    topCustomers: customerGroups.map((group) => {
      const total = money(group._sum.total?.toString() ?? "0");
      const paid = money(group._sum.amountPaid?.toString() ?? "0");
      return {
        customerId: group.customerId,
        customerName: customerNames.get(group.customerId) ?? "Customer",
        invoiceCount: group._count._all,
        total: moneyString(total),
        paid: moneyString(paid),
        outstanding: moneyString(total.minus(paid)),
      };
    }),
    organizationActivity: organizationGroups.map((group) => ({
      organizationId: group.organizationId,
      organizationName: orgNames.get(group.organizationId) ?? "Organization",
      invoiceCount: group._count._all,
      revenue: moneyString(group._sum.amountPaid?.toString() ?? "0"),
    })),
    recentInvoices: recentInvoiceRows.map((row) => toInvoiceSummary(row, now)),
    recentPayments: recentPaymentRows.map(toPaymentSummary),
    overdueInvoices: overdueInvoiceRows.map((row) => toInvoiceSummary(row, now)),
    organizations,
  };
}

const invoiceSummarySelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  total: true,
  amountPaid: true,
  dueDate: true,
  currency: true,
  customer: { select: { name: true } },
  organization: { select: { name: true } },
} as const;

function buildInvoiceWhere(scope: DashboardQueryScope): Prisma.InvoiceWhereInput {
  const access = scope.invoiceAccess
    ? {
        OR: [
          { createdById: scope.invoiceAccess.createdById },
          { assignedMemberId: scope.invoiceAccess.assignedMemberId },
          scope.invoiceAccess.assignedTeamIds.length > 0
            ? { assignedTeamId: { in: scope.invoiceAccess.assignedTeamIds } }
            : undefined,
        ].filter(Boolean) as Prisma.InvoiceWhereInput[],
      }
    : undefined;

  return {
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    ...(scope.assignedTeamId ? { assignedTeamId: scope.assignedTeamId } : {}),
    ...(access ?? {}),
  };
}

function toInvoiceSummary(
  row: {
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    total: { toString(): string };
    amountPaid: { toString(): string };
    dueDate: Date;
    currency: string;
    customer: { name: string };
    organization: { name: string } | null;
  },
  now: Date,
): DashboardInvoiceSummary {
  const total = moneyString(row.total.toString());
  const amountPaid = moneyString(row.amountPaid.toString());
  const status = deriveInvoiceStatus({
    storedStatus: row.status,
    total,
    amountPaid,
    dueDate: row.dueDate,
    now,
  });
  const balance = money(total).minus(amountPaid);

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    status,
    paymentStatus: derivePaymentStatus(total, amountPaid, status),
    total,
    amountPaid,
    balanceDue: moneyString(balance.lt(0) ? 0 : balance),
    dueDate: row.dueDate.toISOString(),
    currency: row.currency,
    customerName: row.customer.name,
    organizationName: row.organization?.name ?? null,
  };
}

function toPaymentSummary(row: {
  id: string;
  amount: { toString(): string };
  currency: string;
  paidAt: Date | null;
  invoiceId: string;
  invoice: { invoiceNumber: string; organization: { name: string } | null };
  customer: { name: string };
}): DashboardPaymentSummary {
  return {
    id: row.id,
    amount: moneyString(row.amount.toString()),
    currency: row.currency,
    paidAt: row.paidAt?.toISOString() ?? null,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice.invoiceNumber,
    customerName: row.customer.name,
    organizationName: row.invoice.organization?.name ?? null,
  };
}

function buildMoneySeries(
  rows: Array<{ amount: { toString(): string }; currency: string } & Record<string, unknown>>,
  range: DateRange,
  daily: boolean,
  currency: string,
  dateOf: (row: { paidAt?: Date | null; incurredOn?: Date } & Record<string, unknown>) => Date | null | undefined,
): DashboardSeriesPoint[] {
  const buckets = new Map<string, ReturnType<typeof money>>();
  for (const key of periodKeys(range, daily)) {
    buckets.set(key, money(0));
  }

  for (const row of rows) {
    const at = dateOf(row);
    if (!at || row.currency !== currency) {
      continue;
    }
    const key = periodKey(at, daily);
    const current = buckets.get(key);
    if (current) {
      buckets.set(key, current.plus(row.amount.toString()));
    }
  }

  return [...buckets.entries()].map(([period, amount]) => ({
    period,
    amount: moneyString(amount),
  }));
}

