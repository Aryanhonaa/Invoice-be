import type { CatalogKind, InvoiceStatus, Prisma } from "@prisma/client";
import { startOfUtcDay } from "../lib/date-range.js";
import { prisma } from "../lib/prisma.js";
import type { InvoiceRecord } from "../lib/invoice-view.js";
import type { AddressInput } from "../types/auth.js";

const invoicePaymentInclude = {
  invoice: {
    select: { id: true, invoiceNumber: true },
  },
  customer: {
    select: { id: true, name: true, company: true },
  },
  recordedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

const invoiceInclude = {
  organization: true,
  customer: true,
  createdBy: true,
  assignedTeam: true,
  assignedMember: true,
  billingAddress: true,
  shippingAddress: true,
  items: true,
} as const;

const invoiceDetailInclude = {
  ...invoiceInclude,
  payments: {
    include: invoicePaymentInclude,
    orderBy: { createdAt: "asc" as const },
  },
};

function addressData(input: AddressInput) {
  return {
    line1: input.line1,
    line2: input.line2 ?? null,
    city: input.city,
    region: input.region ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country,
  };
}

export async function findInvoiceById(id: string): Promise<InvoiceRecord | null> {
  return prisma.invoice.findUnique({
    where: { id },
    include: invoiceDetailInclude,
  });
}

export async function findInvoiceByOrganizationAndNumber(
  organizationId: string,
  invoiceNumber: string,
): Promise<InvoiceRecord | null> {
  return prisma.invoice.findUnique({
    where: {
      organizationId_invoiceNumber: { organizationId, invoiceNumber },
    },
    include: invoiceInclude,
  });
}

export async function findLatestInvoiceNumber(
  organizationId: string,
  prefix: string,
): Promise<string | null> {
  const rows = await prisma.invoice.findMany({
    where: {
      organizationId,
      invoiceNumber: { startsWith: prefix },
    },
    select: { invoiceNumber: true },
  });

  let max = 0;
  let latest: string | null = null;
  for (const row of rows) {
    const value = Number(row.invoiceNumber.slice(prefix.length));
    if (Number.isFinite(value) && value >= max) {
      max = value;
      latest = row.invoiceNumber;
    }
  }
  return latest;
}

export async function listInvoices(query: {
  search?: string;
  status?: InvoiceStatus;
  overdue?: boolean;
  customerId?: string;
  organizationId?: string;
  createdById?: string;
  assignedMemberId?: string;
  assignedTeamIds?: string[];
  assignedTeamId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort?: "invoiceDate" | "dueDate" | "total" | "invoiceNumber" | "createdAt";
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
  now?: Date;
}): Promise<{ items: InvoiceRecord[]; total: number }> {
  const accessFilter: Prisma.InvoiceWhereInput | undefined =
    query.createdById || query.assignedMemberId || query.assignedTeamIds
      ? {
          OR: [
            query.createdById ? { createdById: query.createdById } : undefined,
            query.assignedMemberId ? { assignedMemberId: query.assignedMemberId } : undefined,
            query.assignedTeamIds && query.assignedTeamIds.length > 0
              ? { assignedTeamId: { in: query.assignedTeamIds } }
              : undefined,
          ].filter(Boolean) as Prisma.InvoiceWhereInput[],
        }
      : undefined;

  const where: Prisma.InvoiceWhereInput = {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.assignedTeamId ? { assignedTeamId: query.assignedTeamId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          invoiceDate: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { invoiceNumber: { contains: query.search, mode: "insensitive" } },
            { customer: { name: { contains: query.search, mode: "insensitive" } } },
            { customer: { company: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(query.overdue
      ? {
          status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
          dueDate: { lt: startOfUtcDay(query.now ?? new Date()) },
        }
      : query.status
        ? { status: query.status }
        : {}),
    ...(accessFilter ?? {}),
  };

  const sort = query.sort ?? "createdAt";
  const sortDir = query.sortDir ?? "desc";

  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { [sort]: sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  return { items, total };
}

export async function createInvoice(data: {
  organizationId: string;
  customerId: string;
  createdById: string;
  assignedTeamId?: string | null;
  assignedMemberId?: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  notes?: string | null;
  terms?: string | null;
  billingAddress?: AddressInput | null;
  shippingAddress?: AddressInput | null;
  items: Array<{
    productId?: string | null;
    catalogKind?: CatalogKind | null;
    sku?: string | null;
    unit?: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate?: string | null;
    taxAmount: string;
    lineTotal: string;
    sortOrder: number;
  }>;
}): Promise<InvoiceRecord> {
  return prisma.$transaction(async (tx) => {
    const billingAddress = data.billingAddress
      ? await tx.address.create({ data: addressData(data.billingAddress) })
      : null;
    const shippingAddress = data.shippingAddress
      ? await tx.address.create({ data: addressData(data.shippingAddress) })
      : null;

    return tx.invoice.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        createdById: data.createdById,
        assignedTeamId: data.assignedTeamId ?? null,
        assignedMemberId: data.assignedMemberId ?? null,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        currency: data.currency,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        total: data.total,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        billingAddressId: billingAddress?.id,
        shippingAddressId: shippingAddress?.id,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId ?? null,
            catalogKind: item.catalogKind ?? null,
            sku: item.sku ?? null,
            unit: item.unit ?? null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxRate: item.taxRate ?? null,
            taxAmount: item.taxAmount,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: invoiceInclude,
    });
  });
}

export async function updateInvoice(
  id: string,
  data: {
    customerId?: string;
    assignedTeamId?: string | null;
    assignedMemberId?: string | null;
    invoiceNumber?: string;
    invoiceDate?: Date;
    dueDate?: Date;
    currency?: string;
    subtotal?: string;
    discountAmount?: string;
    taxAmount?: string;
    total?: string;
    amountPaid?: string;
    notes?: string | null;
    terms?: string | null;
    status?: InvoiceStatus;
    sentAt?: Date | null;
    viewedAt?: Date | null;
    billingAddress?: AddressInput | null;
    shippingAddress?: AddressInput | null;
    items?: Array<{
      productId?: string | null;
      catalogKind?: CatalogKind | null;
      sku?: string | null;
      unit?: string | null;
      description: string;
      quantity: string;
      unitPrice: string;
      discount: string;
      taxRate?: string | null;
      taxAmount: string;
      lineTotal: string;
      sortOrder: number;
    }>;
  },
): Promise<InvoiceRecord> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findUnique({ where: { id } });
    if (!current) {
      throw new Error("Invoice not found");
    }

    let billingAddressId = current.billingAddressId;
    let shippingAddressId = current.shippingAddressId;

    if (data.billingAddress !== undefined) {
      billingAddressId = await replaceAddress(tx, current.billingAddressId, data.billingAddress);
    }
    if (data.shippingAddress !== undefined) {
      shippingAddressId = await replaceAddress(tx, current.shippingAddressId, data.shippingAddress);
    }

    if (data.items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    }

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        customerId: data.customerId,
        assignedTeamId: data.assignedTeamId,
        assignedMemberId: data.assignedMemberId,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        currency: data.currency,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        total: data.total,
        amountPaid: data.amountPaid,
        notes: data.notes,
        terms: data.terms,
        status: data.status,
        sentAt: data.sentAt,
        viewedAt: data.viewedAt,
        billingAddressId,
        shippingAddressId,
        ...(data.items
          ? {
              items: {
                create: data.items.map((item) => ({
                  productId: item.productId ?? null,
                  catalogKind: item.catalogKind ?? null,
                  sku: item.sku ?? null,
                  unit: item.unit ?? null,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discount: item.discount,
                  taxRate: item.taxRate ?? null,
                  taxAmount: item.taxAmount,
                  lineTotal: item.lineTotal,
                  sortOrder: item.sortOrder,
                })),
              },
            }
          : {}),
      },
      include: invoiceInclude,
    });

    return updated;
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  await prisma.invoice.delete({ where: { id } });
}

async function replaceAddress(
  tx: Prisma.TransactionClient,
  existingId: string | null,
  input: AddressInput | null,
): Promise<string | null> {
  if (input === null) {
    return null;
  }
  if (existingId) {
    await tx.address.update({
      where: { id: existingId },
      data: addressData(input),
    });
    return existingId;
  }
  const created = await tx.address.create({ data: addressData(input) });
  return created.id;
}
