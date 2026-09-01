import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  addMemberToTeam,
  listTeamMemberAccounts,
  removeMemberFromTeam,
} from "../services/team-membership.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import { addTeamMemberSchema, teamMemberParamsSchema } from "../validators/team.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listTeamMembersController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const members = await listTeamMemberAccounts(actor, params.id);
  res.status(200).json(success({ members }));
}

export async function addTeamMemberController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(addTeamMemberSchema, req.body);
  const member = await addMemberToTeam(actor, params.id, body.memberId);
  res.status(201).json(success({ member }));
}

export async function removeTeamMemberController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(teamMemberParamsSchema, req.params);
  await removeMemberFromTeam(actor, params.id, params.memberId);
  res.status(200).json(success({ removed: true }));
}
