import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { OrganizationRecord, TeamRecord, UserRecord } from "../types/auth.js";

export async function findTeamById(id: string): Promise<TeamRecord | null> {
  return prisma.team.findUnique({
    where: { id },
  });
}

export async function findTeamByOrganizationAndName(
  organizationId: string,
  name: string,
): Promise<TeamRecord | null> {
  return prisma.team.findUnique({
    where: {
      organizationId_name: { organizationId, name },
    },
  });
}

export async function listTeams(query: {
  search?: string;
  isActive?: boolean;
  organizationId?: string;
  memberUserId?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: Array<TeamRecord & { organization: OrganizationRecord | null; _count: { members: number } }>; total: number }> {
  const where: Prisma.TeamWhereInput = {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.memberUserId
      ? { members: { some: { userId: query.memberUserId } } }
      : {}),
    ...(query.search
      ? { name: { contains: query.search, mode: "insensitive" } }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.team.findMany({
      where,
      include: {
        organization: true,
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.team.count({ where }),
  ]);

  return { items, total };
}

export async function countTeamMembers(teamId: string): Promise<number> {
  return prisma.teamMember.count({ where: { teamId } });
}

export async function countTeamAdmins(teamId: string): Promise<number> {
  return prisma.teamMember.count({
    where: { teamId, user: { role: "ADMIN" } },
  });
}

export async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: { teamId, userId },
    },
    select: { id: true },
  });

  return membership !== null;
}

export async function createTeam(data: {
  organizationId: string;
  name: string;
  description?: string;
}): Promise<TeamRecord> {
  return prisma.team.create({
    data: {
      organizationId: data.organizationId,
      name: data.name,
      description: data.description,
    },
  });
}

export async function updateTeam(
  id: string,
  data: Partial<Pick<TeamRecord, "name" | "description" | "isActive">>,
): Promise<TeamRecord> {
  return prisma.team.update({
    where: { id },
    data,
  });
}

export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  await prisma.teamMember.create({
    data: { teamId, userId },
  });
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await prisma.teamMember.deleteMany({
    where: { teamId, userId },
  });
}

export async function listTeamMembers(teamId: string): Promise<UserRecord[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { teamId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((membership) => membership.user);
}

export async function listTeamsForUser(userId: string): Promise<TeamRecord[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: { team: true },
  });

  return memberships.map((membership) => membership.team);
}
