import type { InvoiceStatus, UserRole } from "@prisma/client";
import type { PaymentStatus } from "../lib/invoice-status.js";

export type DashboardScopeKind = "SYSTEM" | "ORGANIZATION" | "MEMBER";
export type DashboardGranularity = "day" | "month";

export interface DashboardInvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  total: string;
  amountPaid: string;
  balanceDue: string;
  dueDate: string;
  currency: string;
  customerName: string;
  organizationName: string | null;
}

export interface DashboardPaymentSummary {
  id: string;
  amount: string;
  currency: string;
  paidAt: string | null;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  organizationName: string | null;
}

export interface DashboardStatusCount {
  status: string;
  count: number;
}

export interface DashboardSeriesPoint {
  period: string;
  amount: string;
}

export interface DashboardTeamPerformance {
  teamId: string | null;
  teamName: string;
  invoiceCount: number;
  revenue: string;
  outstanding: string;
}

export interface DashboardTopCustomer {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  total: string;
  paid: string;
  outstanding: string;
}

export interface DashboardOrganizationActivity {
  organizationId: string;
  organizationName: string;
  invoiceCount: number;
  revenue: string;
}

export interface DashboardOrganizationOption {
  id: string;
  name: string;
}

export interface DashboardMetrics {
  organizations: number | null;
  activeOrganizations: number | null;
  inactiveOrganizations: number | null;
  admins: number | null;
  members: number | null;
  teams: number | null;
  customers: number | null;
  invoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  partiallyPaidInvoices: number;
  expenses: string;
  revenue: string;
  paidAmount: string;
  outstandingBalance: string;
  overdueAmount: string;
}

export interface DashboardView {
  role: UserRole;
  scope: DashboardScopeKind;
  organizationId: string | null;
  teamId: string | null;
  currency: string;
  granularity: DashboardGranularity;
  range: { preset: string; start: string; end: string };
  metrics: DashboardMetrics;
  invoiceStatusSeries: DashboardStatusCount[];
  revenueSeries: DashboardSeriesPoint[];
  paymentSeries: DashboardSeriesPoint[];
  expenseSeries: DashboardSeriesPoint[];
  teamPerformance: DashboardTeamPerformance[];
  topCustomers: DashboardTopCustomer[];
  organizationActivity: DashboardOrganizationActivity[];
  recentInvoices: DashboardInvoiceSummary[];
  recentPayments: DashboardPaymentSummary[];
  overdueInvoices: DashboardInvoiceSummary[];
  organizations: DashboardOrganizationOption[];
}
