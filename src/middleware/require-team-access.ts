import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../lib/errors.js";
import { findTeamById, isTeamMember } from "../repositories/team.repository.js";
import { asyncHandler } from "../utils/async-handler.js";
import { readRouteParam } from "../utils/request-param.js";

interface TeamIdSource {
  param?: string;
}

export function requireTeamAccess(source: TeamIdSource = { param: "id" }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void asyncHandler(async (request, _response, pass) => {
      if (!request.authUser) {
        throw new UnauthorizedError();
      }

      const paramName = source.param ?? "id";
      const teamId = readRouteParam(request.params[paramName]);

      if (!teamId) {
        throw new ValidationError("Team id is required");
      }

      const team = await findTeamById(teamId);
      if (!team) {
        throw new NotFoundError("Team not found");
      }

      if (request.authUser.role === "SUPER_ADMIN") {
        request.authorizedTeam = team;
        pass();
        return;
      }

      if (request.authUser.role === "ADMIN") {
        if (request.authUser.organizationId !== team.organizationId) {
          throw new ForbiddenError("You do not have access to this team");
        }
        request.authorizedTeam = team;
        pass();
        return;
      }

      if (
        request.authUser.organizationId !== team.organizationId ||
        !(await isTeamMember(team.id, request.authUser.id))
      ) {
        throw new ForbiddenError("You do not have access to this team");
      }

      request.authorizedTeam = team;
      pass();
    })(req, res, next);
  };
}
