import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  createTeamAccount,
  getTeamAccount,
  listTeamAccounts,
  updateTeamAccount,
  updateTeamStatus,
} from "../services/team.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import {
  createTeamSchema,
  listTeamsQuerySchema,
  updateTeamSchema,
  updateTeamStatusSchema,
} from "../validators/team.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listTeamsController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const query = validate(listTeamsQuerySchema, req.query);
  const result = await listTeamAccounts(actor, query);
  res.status(200).json(success(result));
}

export async function getTeamController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const team = await getTeamAccount(actor, params.id);
  res.status(200).json(success({ team }));
}

export async function createTeamController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createTeamSchema, req.body);
  const team = await createTeamAccount(actor, body);
  res.status(201).json(success({ team }));
}

export async function updateTeamController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateTeamSchema, req.body);
  const team = await updateTeamAccount(actor, params.id, body);
  res.status(200).json(success({ team }));
}

export async function updateTeamStatusController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateTeamStatusSchema, req.body);
  const team = await updateTeamStatus(actor, params.id, body.status);
  res.status(200).json(success({ team }));
}
