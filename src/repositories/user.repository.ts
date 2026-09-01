import type { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { AdminRecord, OrganizationRecord, TeamRecord, UserRecord } from "../types/auth.js";

const adminInclude = { organization: true } as const;

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function findAdminById(id: string): Promise<AdminRecord | null> {
  return prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    include: adminInclude,
  });
}

export async function listAdmins(query: {
  search?: string;
  status?: AccountStatus;
  organizationId?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: AdminRecord[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    role: "ADMIN",
    ...(query.status ? { status: query.status } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: adminInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: UserRole;
  status?: AccountStatus;
  organizationId: string | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
}): Promise<UserRecord> {
  return prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      role: data.role,
      status: data.status ?? "ACTIVE",
      organizationId: data.organizationId,
      passwordResetToken: data.passwordResetToken,
      passwordResetExpires: data.passwordResetExpires,
    },
  });
}

export async function updateUser(
  id: string,
  data: Partial<
    Pick<
      UserRecord,
      | "firstName"
      | "lastName"
      | "phone"
      | "email"
      | "status"
      | "lastLoginAt"
      | "organizationId"
      | "passwordHash"
      | "passwordResetToken"
      | "passwordResetExpires"
    >
  >,
): Promise<UserRecord> {
  return prisma.user.update({
    where: { id },
    data: {
      ...data,
      ...(data.email ? { email: data.email.toLowerCase() } : {}),
    },
  });
}

export async function countUsersByRole(role: UserRole): Promise<number> {
  return prisma.user.count({
    where: { role },
  });
}

export async function findMemberById(id: string): Promise<
  | (UserRecord & {
      organization: OrganizationRecord | null;
      teamMemberships: Array<{ team: TeamRecord }>;
    })
  | null
> {
  return prisma.user.findFirst({
    where: { id, role: "MEMBER" },
    include: {
      organization: true,
      teamMemberships: { include: { team: true } },
    },
  });
}

export async function listMembers(query: {
  search?: string;
  status?: AccountStatus;
  organizationId?: string;
  teamId?: string;
  page: number;
  pageSize: number;
}): Promise<{
  items: Array<
    UserRecord & {
      organization: OrganizationRecord | null;
      teamMemberships: Array<{ team: TeamRecord }>;
    }
  >;
  total: number;
}> {
  const where: Prisma.UserWhereInput = {
    role: "MEMBER",
    ...(query.status ? { status: query.status } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.teamId
      ? { teamMemberships: { some: { teamId: query.teamId } } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: {
        organization: true,
        teamMemberships: { include: { team: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}
