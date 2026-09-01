import type { CatalogKind, InvoiceStatus } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError, ValidationError } from "../lib/errors.js";
import { getEmailProvider } from "../integrations/email/provider.js";
import { assertInvoiceAccess } from "../lib/invoice-access.js";
import { calculateInvoiceTotals } from "../lib/invoice-calc.js";
import {
  canCancelInvoice,
  canDeleteInvoice,
  canEditInvoice,
  canSendInvoice,
} from "../lib/invoice-status.js";
import { toInvoiceView } from "../lib/invoice-view.js";
import { money, moneyString } from "../lib/money.js";
import { assertDueDateNotBeforeInvoiceDate, parseDateValue } from "../lib/parse-date.js";
import { findCustomerById } from "../repositories/customer.repository.js";
import {
  createInvoice,
  deleteInvoice,
  findInvoiceById,
  findInvoiceByOrganizationAndNumber,
  findLatestInvoiceNumber,
  listInvoices,
  updateInvoice,
} from "../repositories/invoice.repository.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import { findProductById } from "../repositories/product.repository.js";
import { findTeamById, isTeamMember, listTeamsForUser } from "../repositories/team.repository.js";
import { findMemberById } from "../repositories/user.repository.js";
import type { AddressInput, AuthUser } from "../types/auth.js";
import type { InvoiceView } from "../types/invoice.js";
import {
  resolveManagedOrganizationId,
  scopedTenantOrganizationId,
} from "../utils/organization-scope.js";
import { resolveTeamScope } from "../utils/team-scope.js";
import { recordAudit } from "./audit.service.js";
import { recordManualPayment } from "./payment.service.js";

interface InvoiceItemInput {
  productId?: string;
  description?: string;
  quantity: string;
  unitPrice?: string;
  discount?: string;
  taxRate?: string;
}

async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `INV-${year}-`;
  const latest = await findLatestInvoiceNumber(organizationId, prefix);
  const current = latest ? Number(latest.slice(prefix.length)) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function snapshotItems(
  organizationId: string,
  items: InvoiceItemInput[],
): Promise<{
  totals: ReturnType<typeof calculateInvoiceTotals>;
  records: Array<{
    productId: string | null;
    catalogKind: CatalogKind | null;
    sku: string | null;
    unit: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate: string | null;
    taxAmount: string;
    lineTotal: string;
    sortOrder: number;
  }>;
}> {
  const prepared = [];

  for (const [index, item] of items.entries()) {
    let description = item.description?.trim() ?? "";
    let unitPrice = item.unitPrice;
    let taxRate = item.taxRate;
    let productId: string | null = null;
    let catalogKind: CatalogKind | null = null;
    let sku: string | null = null;
    let unit: string | null = null;

    if (item.productId) {
      const product = await findProductById(item.productId);
      if (!product || product.organizationId !== organizationId) {
        throw new ForbiddenError("You cannot add a catalog item from another organization");
      }
      productId = product.id;
      catalogKind = product.kind;
      sku = product.sku;
      unit = product.unit;
      description = description || product.name;
      unitPrice = unitPrice ?? product.unitPrice.toString();
      taxRate = taxRate ?? product.taxRate?.toString();
    }

    if (!description) {
      throw new ValidationError("Each invoice item needs a description");
    }
    if (!unitPrice) {
      throw new ValidationError("Each invoice item needs a unit price");
    }

    prepared.push({
      productId,
      catalogKind,
      sku,
      unit,
      description,
      quantity: item.quantity,
      unitPrice,
      discount: item.discount ?? "0",
      taxRate: taxRate ?? null,
      sortOrder: index,
    });
  }

  let totals: ReturnType<typeof calculateInvoiceTotals>;
  try {
    totals = calculateInvoiceTotals(
      prepared.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxRate: item.taxRate ?? undefined,
      })),
    );
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "Invalid invoice amounts");
  }

  return {
    totals,
    records: prepared.map((item, index) => ({
      ...item,
      quantity: moneyString(item.quantity),
      unitPrice: moneyString(item.unitPrice),
      discount: totals.lines[index].discountAmount,
      taxRate: item.taxRate === null ? null : moneyString(item.taxRate),
      taxAmount: totals.lines[index].taxAmount,
      lineTotal: totals.lines[index].lineTotal,
    })),
  };
}

function addressFromCustomer(
  address: { line1: string; line2: string | null; city: string; region: string | null; postalCode: string | null; country: string } | null,
): AddressInput | undefined {
  if (!address) {
    return undefined;
  }
  return {
    line1: address.line1,
    line2: address.line2 ?? undefined,
    city: address.city,
    region: address.region ?? undefined,
    postalCode: address.postalCode ?? undefined,
    country: address.country,
  };
}

async function resolveAssignment(
  actor: AuthUser,
  organizationId: string,
  assignedTeamId?: string,
  assignedMemberId?: string,
): Promise<{ assignedTeamId: string | null; assignedMemberId: string | null }> {
  const teamId = assignedTeamId ?? null;
  const memberId = assignedMemberId ?? null;

  if (teamId) {
    const team = await findTeamById(teamId);
    if (!team || team.organizationId !== organizationId) {
      throw new ForbiddenError("Assigned team must belong to the organization");
    }
    if (actor.role === "MEMBER" && !(await isTeamMember(teamId, actor.id))) {
      throw new ForbiddenError("You can only assign invoices to a team you belong to");
    }
  }

  if (memberId) {
    const member = await findMemberById(memberId);
    if (!member || member.organizationId !== organizationId) {
      throw new ForbiddenError("Assigned member must belong to the organization");
    }
    if (actor.role === "MEMBER" && memberId !== actor.id) {
      throw new ForbiddenError("You can only assign invoices to yourself");
    }
    if (teamId && !(await isTeamMember(teamId, memberId))) {
      throw new ValidationError("Assigned member must belong to the assigned team");
    }
  }

  return { assignedTeamId: teamId, assignedMemberId: memberId };
}

export async function listInvoiceAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: InvoiceStatus;
    customerId?: string;
    organizationId?: string;
    teamId?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: "invoiceDate" | "dueDate" | "total" | "invoiceNumber" | "createdAt";
    sortDir?: "asc" | "desc";
    page: number;
    pageSize: number;
  },
): Promise<{ items: InvoiceView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const organizationId = await scopedTenantOrganizationId(actor, query.organizationId);
  const { teamId } = await resolveTeamScope(actor, {
    organizationId,
    teamId: query.teamId,
  });
  const memberTeams = actor.role === "MEMBER" ? await listTeamsForUser(actor.id) : [];
  const now = new Date();

  const { items, total } = await listInvoices({
    search: query.search,
    status: query.status === "OVERDUE" ? undefined : query.status,
    overdue: query.status === "OVERDUE",
    customerId: query.customerId,
    organizationId,
    createdById: actor.role === "MEMBER" && !teamId ? actor.id : undefined,
    assignedMemberId: actor.role === "MEMBER" && !teamId ? actor.id : undefined,
    assignedTeamIds: actor.role === "MEMBER" && !teamId ? memberTeams.map((team) => team.id) : undefined,
    assignedTeamId: teamId ?? undefined,
    dateFrom: query.dateFrom ? parseDateValue(query.dateFrom, "dateFrom") : undefined,
    dateTo: query.dateTo ? parseDateValue(query.dateTo, "dateTo") : undefined,
    sort: query.sort,
    sortDir: query.sortDir,
    page: query.page,
    pageSize: query.pageSize,
    now,
  });

  return {
    items: items.map((invoice) => toInvoiceView(invoice, now)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);
  return toInvoiceView(invoice);
}

export async function createInvoiceAccount(
  actor: AuthUser,
  input: {
    customerId: string;
    organizationId?: string;
    invoiceNumber?: string;
    invoiceDate: string;
    dueDate: string;
    currency?: string;
    notes?: string;
    terms?: string;
    assignedTeamId?: string;
    assignedMemberId?: string;
    items: InvoiceItemInput[];
  },
): Promise<InvoiceView> {
  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  const customer = await findCustomerById(input.customerId);
  if (!customer || customer.organizationId !== organizationId) {
    throw new ForbiddenError("Customer must belong to the organization");
  }

  const invoiceDate = parseDateValue(input.invoiceDate, "Invoice date");
  const dueDate = parseDateValue(input.dueDate, "Due date");
  assertDueDateNotBeforeInvoiceDate(invoiceDate, dueDate);

  let assignedTeamId = input.assignedTeamId;
  const assignedMemberId =
    input.assignedMemberId ?? (actor.role === "MEMBER" ? actor.id : undefined);
  if (!assignedTeamId && (actor.role === "ADMIN" || actor.role === "MEMBER")) {
    const teams = await listTeamsForUser(actor.id);
    assignedTeamId = teams[0]?.id;
  }
  const assignment = await resolveAssignment(
    actor,
    organizationId,
    assignedTeamId,
    assignedMemberId,
  );

  const invoiceNumber = input.invoiceNumber?.trim() || (await nextInvoiceNumber(organizationId));
  const existing = await findInvoiceByOrganizationAndNumber(organizationId, invoiceNumber);
  if (existing) {
    throw new ConflictError("An invoice with this number already exists in the organization");
  }

  const { totals, records } = await snapshotItems(organizationId, input.items);

  const invoice = await createInvoice({
    organizationId,
    customerId: customer.id,
    createdById: actor.id,
    assignedTeamId: assignment.assignedTeamId,
    assignedMemberId: assignment.assignedMemberId,
    invoiceNumber,
    invoiceDate,
    dueDate,
    currency: input.currency?.trim() || "USD",
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
    notes: input.notes,
    terms: input.terms,
    billingAddress: addressFromCustomer(customer.billingAddress),
    shippingAddress: addressFromCustomer(customer.shippingAddress),
    items: records,
  });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_CREATED",
    entity: "Invoice",
    entityId: invoice.id,
    organizationId,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });

  return toInvoiceView(invoice);
}

export async function updateInvoiceAccount(
  actor: AuthUser,
  id: string,
  input: {
    customerId?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    currency?: string;
    notes?: string | null;
    terms?: string | null;
    assignedTeamId?: string | null;
    assignedMemberId?: string | null;
    items?: InvoiceItemInput[];
    status?: unknown;
  },
): Promise<InvoiceView> {
  if (input.status !== undefined) {
    throw new ForbiddenError("Invoice status cannot be changed through this endpoint");
  }

  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (!canEditInvoice(invoice.status)) {
    throw new ForbiddenError("Only draft invoices can be edited");
  }

  if (input.invoiceNumber && input.invoiceNumber !== invoice.invoiceNumber) {
    const duplicate = await findInvoiceByOrganizationAndNumber(
      invoice.organizationId,
      input.invoiceNumber,
    );
    if (duplicate) {
      throw new ConflictError("An invoice with this number already exists in the organization");
    }
  }

  if (input.customerId && input.customerId !== invoice.customerId) {
    const customer = await findCustomerById(input.customerId);
    if (!customer || customer.organizationId !== invoice.organizationId) {
      throw new ForbiddenError("Customer must belong to the organization");
    }
  }

  const assignment = await resolveAssignment(
    actor,
    invoice.organizationId,
    input.assignedTeamId === undefined ? invoice.assignedTeamId ?? undefined : input.assignedTeamId ?? undefined,
    input.assignedMemberId === undefined
      ? invoice.assignedMemberId ?? undefined
      : input.assignedMemberId ?? undefined,
  );

  const invoiceDate = input.invoiceDate
    ? parseDateValue(input.invoiceDate, "Invoice date")
    : invoice.invoiceDate;
  const dueDate = input.dueDate ? parseDateValue(input.dueDate, "Due date") : invoice.dueDate;
  assertDueDateNotBeforeInvoiceDate(invoiceDate, dueDate);

  const snapshot = input.items
    ? await snapshotItems(invoice.organizationId, input.items)
    : null;

  const updated = await updateInvoice(invoice.id, {
    customerId: input.customerId,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate ? invoiceDate : undefined,
    dueDate: input.dueDate ? dueDate : undefined,
    currency: input.currency,
    notes: input.notes,
    terms: input.terms,
    assignedTeamId: assignment.assignedTeamId,
    assignedMemberId: assignment.assignedMemberId,
    ...(snapshot
      ? {
          subtotal: snapshot.totals.subtotal,
          discountAmount: snapshot.totals.discountAmount,
          taxAmount: snapshot.totals.taxAmount,
          total: snapshot.totals.total,
          items: snapshot.records,
        }
      : {}),
  });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_UPDATED",
    entity: "Invoice",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { invoiceNumber: updated.invoiceNumber },
  });

  return toInvoiceView(updated);
}

export async function deleteInvoiceAccount(actor: AuthUser, id: string): Promise<void> {
  if (actor.role === "MEMBER") {
    throw new ForbiddenError("You cannot delete invoices");
  }

  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (!canDeleteInvoice(invoice.status)) {
    throw new ForbiddenError("Only draft invoices can be deleted");
  }

  await deleteInvoice(invoice.id);

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_DELETED",
    entity: "Invoice",
    entityId: invoice.id,
    organizationId: invoice.organizationId,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });
}

export async function sendInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (!canSendInvoice(invoice.status)) {
    throw new ForbiddenError("Only draft invoices can be sent");
  }

  const recipient = invoice.customer.email?.trim();
  if (!recipient) {
    throw new ValidationError("This customer does not have an email address");
  }

  const mailer = getEmailProvider();
  if (!mailer.isConfigured()) {
    throw new ServiceUnavailableError("Email sending is not configured yet.", "EMAIL_NOT_CONFIGURED");
  }

  await mailer.sendInvoiceEmail({
    to: recipient,
    customerName: invoice.customer.name,
    invoiceNumber: invoice.invoiceNumber,
    amount: moneyString(money(invoice.total.toString())),
    currency: invoice.currency,
    dueDate: invoice.dueDate.toISOString(),
    companyName: invoice.organization?.name ?? "Company",
  });

  const zeroTotal = money(invoice.total.toString()).lte(0);
  const updated = await updateInvoice(invoice.id, {
    status: zeroTotal ? "PAID" : "SENT",
    sentAt: new Date(),
  });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_SENT",
    entity: "Invoice",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { invoiceNumber: updated.invoiceNumber },
  });

  return toInvoiceView(updated);
}

export async function duplicateInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  return createInvoiceAccount(actor, {
    customerId: invoice.customerId,
    organizationId: invoice.organizationId,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    currency: invoice.currency,
    notes: invoice.notes ?? undefined,
    terms: invoice.terms ?? undefined,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      discount: item.discount.toString(),
      taxRate: item.taxRate?.toString(),
    })),
  });
}

export async function cancelInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (!canCancelInvoice(invoice.status)) {
    throw new ForbiddenError("This invoice cannot be cancelled");
  }

  const updated = await updateInvoice(invoice.id, { status: "CANCELLED" });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_CANCELLED",
    entity: "Invoice",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { invoiceNumber: updated.invoiceNumber },
  });

  return toInvoiceView(updated);
}

export async function recordInvoicePayment(
  actor: AuthUser,
  id: string,
  input: {
    amount: string;
    method?: "CASH" | "BANK_TRANSFER" | "CHECK" | "OTHER";
    paidAt?: string;
    notes?: string;
    providerTransactionId?: string;
    reference?: string;
  },
): Promise<InvoiceView> {
  const result = await recordManualPayment(actor, {
    invoiceId: id,
    amount: input.amount,
    method: input.method,
    paidAt: input.paidAt,
    notes: input.notes,
    providerTransactionId: input.providerTransactionId ?? input.reference,
  });
  return result.invoice;
}

