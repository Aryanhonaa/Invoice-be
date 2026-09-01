import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  createTeamController,
  getTeamController,
  listTeamsController,
  updateTeamController,
  updateTeamStatusController,
} from "../controllers/team.controller.js";
import {
  addTeamMemberController,
  listTeamMembersController,
  removeTeamMemberController,
} from "../controllers/team-membership.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireRole } from "../middleware/require-role.js";
import { requireTeamAccess } from "../middleware/require-team-access.js";
import { asyncHandler } from "../utils/async-handler.js";

const teamRouter = Router();

teamRouter.use(requireAuth);

teamRouter.get("/", requirePermission(Permissions.TEAMS_VIEW), asyncHandler(listTeamsController));
teamRouter.post(
  "/",
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.TEAMS_CREATE),
  asyncHandler(createTeamController),
);

teamRouter.get(
  "/:id/members",
  requireTeamAccess({ param: "id" }),
  requirePermission(Permissions.TEAMS_VIEW),
  asyncHandler(listTeamMembersController),
);
teamRouter.post(
  "/:id/members",
  requireRole("ADMIN", "SUPER_ADMIN"),
  requirePermission(Permissions.TEAMS_UPDATE),
  asyncHandler(addTeamMemberController),
);
teamRouter.delete(
  "/:id/members/:memberId",
  requireRole("ADMIN", "SUPER_ADMIN"),
  requirePermission(Permissions.TEAMS_UPDATE),
  asyncHandler(removeTeamMemberController),
);

teamRouter.patch(
  "/:id/status",
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.TEAMS_UPDATE),
  asyncHandler(updateTeamStatusController),
);
teamRouter.get(
  "/:id",
  requireTeamAccess({ param: "id" }),
  requirePermission(Permissions.TEAMS_VIEW),
  asyncHandler(getTeamController),
);
teamRouter.patch(
  "/:id",
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.TEAMS_UPDATE),
  asyncHandler(updateTeamController),
);

export { teamRouter };
