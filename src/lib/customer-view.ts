import type { Address, Customer, Organization } from "@prisma/client";
import type { AddressView, CustomerView, OrganizationSummary } from "../types/auth.js";

function toOrganizationSummary(organization: Organization | null): OrganizationSummary | null {
  if (!organization) {
    return null;
  }
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    isActive: organization.isActive,
  };
}

export function toAddressView(address: Address | null): AddressView | null {
  if (!address) {
    return null;
  }
  return {
    id: address.id,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: address.country,
  };
}

export function toCustomerView(
  customer: Customer & {
    billingAddress: Address | null;
    shippingAddress: Address | null;
    organization: Organization | null;
  },
): CustomerView {
  return {
    id: customer.id,
    organizationId: customer.organizationId,
    name: customer.name,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    taxNumber: customer.taxNumber,
    notes: customer.notes,
    isActive: customer.isActive,
    billingAddress: toAddressView(customer.billingAddress),
    shippingAddress: toAddressView(customer.shippingAddress),
    organization: toOrganizationSummary(customer.organization),
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}
