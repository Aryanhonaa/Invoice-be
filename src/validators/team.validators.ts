import { z } from "zod";

export const createTeamSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    organizationId: z.string().uuid().optional(),
  })
  .strict();

export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updateTeamStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export const listTeamsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  organizationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const addTeamMemberSchema = z
  .object({
    memberId: z.string().uuid(),
  })
  .strict();

export const teamMemberParamsSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
});
