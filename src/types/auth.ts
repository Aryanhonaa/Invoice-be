import type { AccountStatus, UserRole } from "@prisma/client";
import type { PermissionCode } from "../config/permissions.js";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: AccountStatus;
  organizationId: string | null;
  permissions: PermissionCode[];
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  status: AccountStatus;
  organizationId: string | null;
  permissions: PermissionCode[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface AdminView extends PublicUser {
  organization: OrganizationSummary | null;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  status: AccountStatus;
  organizationId: string | null;
  lastLoginAt: Date | null;
  passwordResetToken: string | null;
  passwordResetExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminRecord extends UserRecord {
  organization: OrganizationRecord | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamRecord {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamView {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  memberCount: number;
  organization: OrganizationSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberTeamSummary {
  id: string;
  name: string;
  isActive: boolean;
}

export interface MemberView extends PublicUser {
  organization: OrganizationSummary | null;
  teams: MemberTeamSummary[];
}

export type CatalogKind = "PRODUCT" | "SERVICE";

export interface AddressView {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
}

export interface AddressInput {
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
}

export interface CustomerView {
  id: string;
  organizationId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  billingAddress: AddressView | null;
  shippingAddress: AddressView | null;
  organization: OrganizationSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductView {
  id: string;
  organizationId: string;
  kind: CatalogKind;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string | null;
  unitPrice: number;
  currency: string;
  taxRate: number | null;
  isActive: boolean;
  organization: OrganizationSummary | null;
  createdAt: string;
  updatedAt: string;
}
