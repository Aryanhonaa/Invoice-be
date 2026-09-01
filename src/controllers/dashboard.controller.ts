import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { getDashboard } from "../services/dashboard.service.js";
import { success } from "../utils/api-response.js";
import { dashboardQuerySchema } from "../validators/dashboard.validators.js";
import { validate } from "../validators/validate.js";

export async function getDashboardController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  const query = validate(dashboardQuerySchema, req.query);
  const dashboard = await getDashboard(req.authUser, query);
  res.status(200).json(success({ dashboard }));
}
